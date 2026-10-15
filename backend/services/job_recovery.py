"""Recovery of delivery jobs whose runner is gone.

A job is ``running`` only while some process works on it. When that process
dies (an RQ worker is killed, or the API restarts while it runs jobs
in-process) nothing moves the row on, so the job would stay active forever.
The API therefore fails jobs that have been running for longer than
``JOB_RUNNING_TIMEOUT_SECONDS``, at startup and then every
``JOB_RECOVERY_INTERVAL_SECONDS``.

Without Redis the API process is the only runner, so at startup every
``running`` job is failed at once and the jobs still waiting to run are
queued again; they lived only in the previous process.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional

from backend.core.config import settings
from backend.core.database import get_session_context

from .deliveries import DeliveryService
from .job_webhooks import JobWebhookNotifier
from .queue import TaskScheduler

logger = logging.getLogger(__name__)

INTERRUPTED_RESULT: Dict[str, Any] = {
    "status": "failed",
    "error_message": (
        "Generation was interrupted before it finished (the worker stopped or "
        "the job timed out)"
    ),
}


@dataclass(frozen=True)
class FailedJob:
    """What the job-finished webhook needs to know about a failed job."""

    job_id: str
    prompt: str
    params: Dict[str, Any]


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
    scheduler: Optional[TaskScheduler] = None,
) -> RecoveryReport:
    """Fail jobs that lost their runner and, after an in-process restart, requeue.

    ``scheduler`` runs requeued jobs when there is no durable queue; without
    one they run before this returns.
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
            deliveries.enqueue_job(job.id, background_tasks=scheduler)
            report.requeued.append(job.id)

    return report


class ThreadTaskScheduler:
    """Run scheduled tasks one at a time on a background thread."""

    def __init__(self) -> None:
        """Create the executor; its thread starts with the first task."""
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="job-recovery"
        )

    def add_task(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        """Queue ``func(*args, **kwargs)`` behind the tasks already queued."""
        self._executor.submit(func, *args, **kwargs)

    def shutdown(self) -> None:
        """Drop queued tasks; a task already running is left to finish."""
        self._executor.shutdown(wait=False, cancel_futures=True)


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
        self._scheduler = ThreadTaskScheduler()
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
        """Stop the loop and drop requeued jobs that have not started."""
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._scheduler.shutdown()

    async def run_once(self, *, at_startup: bool) -> RecoveryReport:
        """Run one recovery pass and announce the jobs it failed."""

        def _recover() -> RecoveryReport:
            with get_session_context() as session:
                return recover_jobs(
                    self._deliveries_factory(session),
                    at_startup=at_startup,
                    running_timeout=self._running_timeout,
                    scheduler=self._scheduler,
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
            logger.info("Requeued %d job(s) after restart", len(report.requeued))
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
    "RecoveryReport",
    "ThreadTaskScheduler",
    "recover_jobs",
]
