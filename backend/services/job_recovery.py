"""Recovery of delivery jobs whose runner is gone.

A job is ``running`` only while some process works on it. When that process
dies (an RQ worker is killed, or the API restarts while it runs jobs
in-process) nothing moves the row on, so the job would stay active forever.
The API therefore fails jobs that have been running for longer than
``JOB_RUNNING_TIMEOUT_SECONDS``, at startup and then every
``JOB_RECOVERY_INTERVAL_SECONDS``.

Without Redis the API process is the only runner, so at startup every
``running`` job is failed at once and the jobs still waiting to run are
queued again; they lived only in the previous process. They go through the
queue orchestrator to the same in-process job runner as new requests, so
recovered and new jobs still run one at a time.

With Redis, a waiting (``pending``/``retrying``) job whose RQ job is gone,
because Redis was flushed or restarted without persistence, or whose RQ job
already finished, would never run. Every pass (at startup and periodically)
asks the queue (:meth:`QueueOrchestrator.has_pending`) about each waiting job
and queues the lost ones again through the orchestrator.
RQ job ids are deterministic per delivery, so a job RQ still holds is never
queued twice; periodic passes skip jobs younger than
:data:`LOST_JOB_GRACE`, which a request may be enqueueing right now. A
duplicate that slips through anyway is harmless: claiming is conditional, so
the second run skips the job.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Callable, List, Optional

from backend.core.config import settings
from backend.core.database import get_session_context
from backend.core.logging import get_logger
from backend.schemas.delivery_jobs import DeliveryJobParams, DeliveryJobResult

from .deliveries import DeliveryService
from .job_webhooks import JobWebhookNotifier
from .queue import QueueOrchestrator, QueueUnavailableError

logger = get_logger(__name__)

INTERRUPTED_RESULT = DeliveryJobResult(
    status="failed",
    error_message=(
        "Generation was interrupted before it finished (the worker stopped or "
        "the job timed out)"
    ),
)


LOST_JOB_GRACE = timedelta(seconds=30)
"""How old a waiting job must be before a periodic pass may requeue it.

A request creates the job row before it enqueues the job, so a younger job
may simply not be enqueued yet.
"""


@dataclass(frozen=True)
class FailedJob:
    """What the job-finished webhook needs to know about a failed job."""

    job_id: str
    prompt: str
    params: DeliveryJobParams


@dataclass
class RecoveryReport:
    """Jobs failed and jobs queued again by one recovery pass."""

    failed: List[FailedJob] = field(default_factory=list)
    requeued: List[str] = field(default_factory=list)


def recover_jobs(
    deliveries: DeliveryService,
    *,
    at_startup: bool,
    running_timeout: timedelta,
) -> RecoveryReport:
    """Fail jobs that lost their runner and requeue waiting jobs the queue lost.

    In-process, waiting jobs are requeued only at startup. With a durable
    queue every pass requeues the waiting jobs it no longer holds.
    """
    orchestrator = deliveries.queue_orchestrator
    in_process = orchestrator is None or not orchestrator.has_durable_queue()
    restarted_in_process = at_startup and in_process

    older_than = timedelta(0) if restarted_in_process else running_timeout
    report = RecoveryReport()
    for job in deliveries.fail_running_jobs(
        older_than=older_than, result=INTERRUPTED_RESULT
    ):
        params = deliveries.get_job_params(job)
        report.failed.append(FailedJob(job.id, job.prompt, params))

    if restarted_in_process and orchestrator is not None:
        for job in deliveries.list_claimable_jobs():
            deliveries.enqueue_job(job.id)
            report.requeued.append(job.id)
    elif orchestrator is not None and not in_process:
        report.requeued.extend(
            _requeue_lost_jobs(deliveries, orchestrator, at_startup=at_startup)
        )

    return report


def _requeue_lost_jobs(
    deliveries: DeliveryService,
    orchestrator: QueueOrchestrator,
    *,
    at_startup: bool,
) -> List[str]:
    """Queue again the waiting jobs the durable queue no longer holds.

    Stops at the first queue error and leaves the jobs waiting: the queue is
    down, and the next pass tries again. (Unlike a request's enqueue, which
    fails a job the queue rejects, since nothing else would retry it.)
    """
    requeued: List[str] = []
    older_than = None if at_startup else LOST_JOB_GRACE
    for job in deliveries.list_claimable_jobs(older_than=older_than):
        try:
            if orchestrator.has_pending(job.id):
                continue
            orchestrator.enqueue_delivery(job.id)
        except QueueUnavailableError:
            logger.warning("Queue rejected recovered job %s", job.id)
            break
        except Exception:
            logger.warning("Could not check queued job %s", job.id, exc_info=True)
            break
        requeued.append(job.id)
    return requeued


class JobRecovery:
    """Run :func:`recover_jobs` at startup and then periodically."""

    def __init__(
        self,
        *,
        interval_seconds: float,
        running_timeout: timedelta,
        deliveries_factory: Optional[Callable[[Any], DeliveryService]] = None,
        notifier_factory: Callable[
            [], Optional[JobWebhookNotifier]
        ] = JobWebhookNotifier.from_settings,
    ) -> None:
        """Store the schedule and how to build the delivery service per pass."""
        self._interval_seconds = interval_seconds
        self._running_timeout = running_timeout
        self._deliveries_factory = deliveries_factory or _container_deliveries
        self._notifier_factory = notifier_factory
        self._task: Optional[asyncio.Task[None]] = None

    @classmethod
    def from_settings(cls) -> "JobRecovery":
        """Build the recovery loop from the application settings."""
        return cls(
            interval_seconds=settings.JOB_RECOVERY_INTERVAL_SECONDS,
            running_timeout=timedelta(seconds=settings.job_running_timeout_seconds),
        )

    def start(self) -> None:
        """Start the recovery loop on the running event loop."""
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop the recovery loop."""
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def run_once(self, *, at_startup: bool) -> RecoveryReport:
        """Run one recovery pass and announce the jobs it failed."""

        def _recover() -> RecoveryReport:
            with get_session_context() as session:
                return recover_jobs(
                    self._deliveries_factory(session),
                    at_startup=at_startup,
                    running_timeout=self._running_timeout,
                )

        report = await asyncio.to_thread(_recover)
        if report.failed:
            logger.warning(
                "Failed %d interrupted job(s): %s",
                len(report.failed),
                ", ".join(job.job_id for job in report.failed),
            )
            await self._notify(report.failed)
        if report.requeued:
            logger.warning(
                "Requeued %d job(s) the queue had lost: %s",
                len(report.requeued),
                ", ".join(report.requeued),
            )
        return report

    async def _run(self) -> None:
        at_startup = True
        while True:
            try:
                await self.run_once(at_startup=at_startup)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Job recovery pass failed")
            if self._interval_seconds <= 0:
                return
            at_startup = False
            await asyncio.sleep(self._interval_seconds)

    async def _notify(self, failed: List[FailedJob]) -> None:
        notifier = self._notifier_factory()
        if notifier is None:
            return
        for job in failed:
            payload = notifier.build_payload(
                job.job_id, "failed", job.prompt, job.params, INTERRUPTED_RESULT
            )
            await notifier.send(payload)


def _container_deliveries(session: Any) -> DeliveryService:
    """Build the delivery service through the shared service container."""
    from backend.services import get_service_container_builder

    return get_service_container_builder().build(session).deliveries


__all__ = [
    "FailedJob",
    "INTERRUPTED_RESULT",
    "JobRecovery",
    "LOST_JOB_GRACE",
    "RecoveryReport",
    "recover_jobs",
]
