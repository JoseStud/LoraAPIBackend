"""The progress WebSocket's single job monitor loop.

One :class:`JobProgressMonitor`, started and stopped by the FastAPI lifespan,
turns persisted delivery job state into progress WebSocket messages. It does
not depend on the request that created a job: jobs run by the RQ worker,
jobs that job recovery requeued and jobs that were already running when the
API restarted are all reported the same way.

Every ``SDNEXT_POLL_INTERVAL`` seconds, while at least one WebSocket
connection is subscribed, a tick:

1. loads, in one query in a worker thread, the active generation jobs
   (``pending``/``retrying``/``running``), the jobs that finished since the
   previous tick and the jobs it is tracking;
2. sends ``generation_started`` for a job it sees ``running`` that it last
   saw in another status or not at all (a runner claimed it; a retry that is
   claimed again starts again);
3. sends ``progress_update`` for every active job. SD.Next's progress
   endpoint is process-global: it reports whatever SD.Next is rendering and
   ignores the job id it is asked about. Only the job whose persisted status
   is ``running`` (the most recently started one, should several be) gets
   SD.Next's live progress; queued jobs report their stored progress, or 0;
4. sends a final ``progress_update`` and ``generation_complete`` for a job
   that left the active set as ``succeeded`` or ``failed``, built from its
   stored row. A job that finished between two ticks without being seen
   ``running`` gets ``generation_started`` first if a runner claimed it
   (``started_at`` is set). A ``cancelled`` job is dropped silently: the
   client that cancelled it removed it itself, and the SPA reads any
   ``generation_complete`` that is not ``completed`` as a failure.

The first tick (after startup, or after a period without subscribers) seeds
the tracking from the active jobs alone, so jobs already running get
progress and completion without needing a request. With no subscribers the
tick does nothing, not even the database query, and forgets what it tracked.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Protocol, Sequence, Set

from pydantic import ValidationError

from backend.core.logging import get_logger
from backend.schemas import (
    DeliveryJobParams,
    DeliveryJobResult,
    GenerationComplete,
    GenerationStarted,
    ProgressUpdate,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.utils.images import to_browser_image_src
from backend.utils.progress import to_progress_fraction

logger = get_logger(__name__)

ACTIVE_STATUSES = frozenset({"pending", "retrying", "running"})
"""Delivery statuses of a job that has not finished."""

FINISHED_OVERLAP = timedelta(seconds=5)
"""How far back each tick looks for finished jobs beyond the previous tick.

Covers a runner that stamped ``finished_at`` just before the previous query
but committed just after it. Jobs found twice are reported once.
"""


class GenerationProgressClient(Protocol):
    """The part of :class:`GenerationService` the monitor uses."""

    async def check_generation_progress(
        self, job_id: str, backend_name: str = "sdnext"
    ) -> SDNextGenerationResult:
        """Return the backend's current (process-global) progress."""
        ...


@dataclass(frozen=True)
class PersistedJob:
    """A delivery job row as the monitor sees it."""

    job_id: str
    status: str
    mode: Optional[str] = None
    params: DeliveryJobParams = field(default_factory=DeliveryJobParams)
    result: DeliveryJobResult = field(default_factory=DeliveryJobResult)
    """The stored result; empty while the job has none."""
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


@dataclass(frozen=True)
class JobObservation:
    """The jobs one tick loaded, and when it loaded them (the store's clock)."""

    observed_at: datetime
    jobs: List[PersistedJob]


class JobStateRepository(Protocol):
    """Synchronous job loader; the monitor calls it in a worker thread."""

    def load_jobs(
        self,
        *,
        finished_since: Optional[datetime],
        job_ids: Sequence[str],
    ) -> JobObservation:
        """Return active jobs, jobs finished since a time and ``job_ids``."""
        ...


class ProgressBroadcaster(Protocol):
    """Where the monitor sends messages: the WebSocket ``ConnectionManager``."""

    def has_subscribers(self) -> bool:
        """Return whether any connection would receive a job message."""
        ...

    async def broadcast_generation_started(
        self, job_id: str, started_data: GenerationStarted
    ) -> None:
        """Send ``generation_started``."""
        ...

    async def broadcast_progress(
        self, job_id: str, progress_data: ProgressUpdate
    ) -> None:
        """Send ``progress_update``."""
        ...

    async def broadcast_generation_complete(
        self, job_id: str, complete_data: GenerationComplete
    ) -> None:
        """Send ``generation_complete``."""
        ...


class JobProgressMonitor:
    """Report delivery job progress over the WebSocket from one loop."""

    def __init__(
        self,
        *,
        broadcaster: ProgressBroadcaster,
        repository: JobStateRepository,
        generation: GenerationProgressClient,
        interval_seconds: float,
    ) -> None:
        """Store collaborators; nothing runs until :meth:`start`."""
        self._broadcaster = broadcaster
        self._repository = repository
        self._generation = generation
        self._interval_seconds = interval_seconds
        self._task: Optional[asyncio.Task[None]] = None
        self._reset()

    @classmethod
    def from_settings(cls, broadcaster: ProgressBroadcaster) -> "JobProgressMonitor":
        """Build the monitor on the application database and settings."""
        from backend.core.config import settings
        from backend.services.generation import GenerationService

        from .persistence import DeliveryJobStateRepository

        return cls(
            broadcaster=broadcaster,
            repository=DeliveryJobStateRepository(),
            generation=GenerationService(),
            interval_seconds=settings.SDNEXT_POLL_INTERVAL,
        )

    def start(self) -> None:
        """Start the loop on the running event loop."""
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop the loop."""
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def tick(self) -> None:
        """Load job state once and send the messages it calls for."""
        if not self._broadcaster.has_subscribers():
            self._reset()
            return

        observation = await asyncio.to_thread(
            self._repository.load_jobs,
            finished_since=self._finished_since,
            job_ids=tuple(self._statuses),
        )
        if self._seeded_at is None:
            self._seeded_at = observation.observed_at

        # Only generation jobs are reported; other deliveries have no params.
        jobs = [
            job for job in observation.jobs if job.params.generation_params is not None
        ]
        active = [job for job in jobs if job.status in ACTIVE_STATUSES]
        finished = [job for job in jobs if job.status not in ACTIVE_STATUSES]

        live_job = _live_job(active)
        live_result = await self._check_live_progress(live_job) if live_job else None

        for job in active:
            if job.status == "running" and self._statuses.get(job.job_id) != "running":
                await self._send_started(job)
            self._statuses[job.job_id] = job.status
            update = _progress_update(job, live_result if job is live_job else None)
            await self._broadcaster.broadcast_progress(job.job_id, update)

        announced: Set[str] = set()
        for job in finished:
            announced.add(job.job_id)
            if job.job_id in self._announced:
                continue
            previous = self._statuses.pop(job.job_id, None)
            if job.status == "cancelled":
                continue
            if previous != "running" and job.started_at is not None:
                await self._send_started(job)
            await self._broadcaster.broadcast_progress(
                job.job_id, _progress_update(job, None)
            )
            await self._broadcaster.broadcast_generation_complete(
                job.job_id, _completion(job)
            )

        # A tracked job missing from the result was deleted.
        loaded = {job.job_id for job in observation.jobs}
        for job_id in [job_id for job_id in self._statuses if job_id not in loaded]:
            del self._statuses[job_id]

        self._announced = announced
        self._finished_since = max(
            observation.observed_at - FINISHED_OVERLAP, self._seeded_at
        )

    def _reset(self) -> None:
        # Last status seen per active job, and finished jobs already handled.
        self._statuses: Dict[str, str] = {}
        self._announced: Set[str] = set()
        self._finished_since: Optional[datetime] = None
        self._seeded_at: Optional[datetime] = None

    async def _run(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Job progress monitor tick failed")
            await asyncio.sleep(self._interval_seconds)

    async def _check_live_progress(
        self, job: PersistedJob
    ) -> Optional[SDNextGenerationResult]:
        backend = job.params.backend or job.mode or "sdnext"
        try:
            return await self._generation.check_generation_progress(job.job_id, backend)
        except Exception as exc:
            logger.warning(
                "Could not read live generation progress",
                job_id=job.job_id,
                error=str(exc),
            )
            return None

    async def _send_started(self, job: PersistedJob) -> None:
        try:
            params = SDNextGenerationParams.model_validate(job.params.generation_params)
        except ValidationError:
            logger.warning("Stored generation params are invalid", job_id=job.job_id)
            return
        await self._broadcaster.broadcast_generation_started(
            job.job_id, GenerationStarted(job_id=job.job_id, params=params)
        )


def _live_job(active: List[PersistedJob]) -> Optional[PersistedJob]:
    """Return the running job SD.Next's global progress belongs to."""
    running = [job for job in active if job.status == "running"]
    if not running:
        return None
    return max(
        running,
        key=lambda job: (job.started_at is not None, job.started_at or 0),
    )


def _normalized_status(job: PersistedJob) -> str:
    from backend.services.generation.statuses import normalize_status

    return normalize_status(job.status).value


def _progress_update(
    job: PersistedJob, live_result: Optional[SDNextGenerationResult]
) -> ProgressUpdate:
    """Combine stored state with SD.Next's progress for the running job.

    The stored progress wins over the live value, and a completed job reports
    1.0, the same rule the REST queue applies.
    """
    status = _normalized_status(job)
    progress = job.result.progress
    error_message: Optional[str] = None
    if live_result is not None:
        if progress is None:
            progress = to_progress_fraction(live_result.progress)
        error_message = live_result.error_message

    if status == "completed":
        progress = 1.0
    if error_message is None:
        error_message = job.result.failure_message

    return ProgressUpdate(
        job_id=job.job_id,
        progress=progress if progress is not None else 0.0,
        status=status,
        error_message=error_message,
    )


def _completion(job: PersistedJob) -> GenerationComplete:
    """Build the completion message for a finished job from its stored row."""
    result = job.result

    images: Optional[List[str]] = None
    if result.images is not None:
        # Clients render these directly, so send loadable sources only.
        sources = (
            to_browser_image_src(image, job_id=job.job_id, index=index)
            for index, image in enumerate(result.images)
        )
        images = [src for src in sources if src] or None

    return GenerationComplete(
        job_id=job.job_id,
        status=_normalized_status(job),
        images=images,
        error_message=result.failure_message,
        total_duration=_total_duration(job.started_at, job.finished_at),
        generation_info=result.generation_info or None,
    )


def _total_duration(
    started_at: Optional[datetime], finished_at: Optional[datetime]
) -> Optional[float]:
    if started_at is None or finished_at is None:
        return None
    try:
        return float((finished_at - started_at).total_seconds())
    except TypeError:  # one aware and one naive timestamp
        return None


__all__ = [
    "ACTIVE_STATUSES",
    "GenerationProgressClient",
    "JobObservation",
    "JobProgressMonitor",
    "JobStateRepository",
    "PersistedJob",
    "ProgressBroadcaster",
]
