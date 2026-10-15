"""Queue long-running recommendation work and report on it.

Embedding computation and similarity index rebuilds can take minutes, so the
API enqueues them and clients poll the job. The work itself is the worker
tasks in :mod:`backend.workers.tasks`:

- With Redis, the RQ entrypoints are enqueued by dotted path on the delivery
  queue and RQ keeps the status and result.
- Without Redis (or when enqueueing on Redis fails), the async variants of the
  same tasks run on the process-wide :class:`InProcessJobRunner`, behind any
  generation jobs, so embeddings never compete with SDNext for the GPU. Their
  status lives in :class:`RecommendationJobStore`, a bounded in-memory store.

Failed jobs report a generic message per kind; the exception is only logged.
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import re
import threading
import uuid
from collections import OrderedDict
from concurrent.futures import Future
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel

from backend.schemas.recommendations import (
    BatchEmbeddingResponse,
    EmbeddingComputeResponse,
    IndexRebuildResponse,
    RecommendationJobKind,
    RecommendationJobRead,
    RecommendationJobState,
)

from .in_process_jobs import InProcessJobRunner, get_in_process_job_runner
from .queue import QueueOrchestrator, RedisQueueBackend

logger = logging.getLogger(__name__)

# How long finished jobs can be polled, in Redis and in memory.
RESULT_TTL_SECONDS = 24 * 60 * 60
# RQ kills a job after this long; embedding every adapter can take a while.
RQ_JOB_TIMEOUT_SECONDS = 4 * 60 * 60
# Finished in-process jobs kept beyond which the oldest are dropped.
MAX_FINISHED_IN_PROCESS_JOBS = 200

_JOB_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")

_TASKS: Dict[str, str] = {
    "embeddings_batch": "backend.workers.tasks.process_embeddings_batch",
    "embedding": "backend.workers.tasks.compute_single_embedding",
    "index_rebuild": "backend.workers.tasks.rebuild_similarity_index",
}

_FAILURE_MESSAGES: Dict[str, str] = {
    "embeddings_batch": "Embedding computation failed",
    "embedding": "Embedding computation failed",
    "index_rebuild": "Index rebuild failed",
}

_RQ_STATES: Dict[str, RecommendationJobState] = {
    "created": "queued",
    "queued": "queued",
    "deferred": "queued",
    "scheduled": "queued",
    "started": "running",
    "finished": "succeeded",
    "failed": "failed",
    "stopped": "failed",
    "canceled": "failed",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    """Treat naive timestamps (as RQ may store them) as UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _result_model(kind: str, params: Dict[str, Any], raw: Any) -> Optional[BaseModel]:
    """Turn a task's return value into the payload its endpoint returns.

    Returns ``None`` when the task reported failure without raising (the
    single-adapter task returns ``False``).
    """
    if kind == "embeddings_batch":
        return BatchEmbeddingResponse.model_validate(raw)
    if kind == "embedding":
        if raw is not True:
            return None
        return EmbeddingComputeResponse(
            message=f"Embeddings computed for {params['adapter_id']}"
        )
    return IndexRebuildResponse.model_validate(raw)


def _job_read(
    *,
    job_id: str,
    kind: str,
    params: Dict[str, Any],
    status: RecommendationJobState,
    raw_result: Any = None,
    created_at: Optional[datetime] = None,
    started_at: Optional[datetime] = None,
    finished_at: Optional[datetime] = None,
) -> RecommendationJobRead:
    result: Optional[BaseModel] = None
    if status == "succeeded":
        try:
            result = _result_model(kind, params, raw_result)
        except Exception:
            logger.exception("Recommendation job %s returned an invalid result", job_id)
        if result is None:
            status = "failed"
    return RecommendationJobRead(
        job_id=job_id,
        kind=kind,
        status=status,
        created_at=_aware(created_at),
        started_at=_aware(started_at),
        finished_at=_aware(finished_at),
        result=result,
        error=_FAILURE_MESSAGES[kind] if status == "failed" else None,
    )


@dataclass(frozen=True)
class InProcessJobRecord:
    """Status of a recommendation job run by the in-process job runner."""

    job_id: str
    kind: str
    params: Dict[str, Any]
    status: RecommendationJobState = "queued"
    result: Any = None
    created_at: datetime = field(default_factory=_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    @property
    def finished(self) -> bool:
        """Return whether the job has stopped, successfully or not."""
        return self.status in ("succeeded", "failed")


class RecommendationJobStore:
    """Thread-safe, bounded status store for in-process recommendation jobs.

    Finished jobs are dropped once older than ``ttl`` or beyond
    ``max_finished``, oldest first. Queued and running jobs are kept; the
    job runner's own queue bounds them.
    """

    def __init__(
        self,
        *,
        ttl: timedelta = timedelta(seconds=RESULT_TTL_SECONDS),
        max_finished: int = MAX_FINISHED_IN_PROCESS_JOBS,
        clock: Callable[[], datetime] = _now,
    ) -> None:
        """Create an empty store."""
        self._ttl = ttl
        self._max_finished = max_finished
        self._clock = clock
        self._lock = threading.Lock()
        self._jobs: "OrderedDict[str, InProcessJobRecord]" = OrderedDict()

    def add(self, record: InProcessJobRecord) -> None:
        """Track a newly queued job."""
        with self._lock:
            self._jobs[record.job_id] = record
            self._prune()

    def get(self, job_id: str) -> Optional[InProcessJobRecord]:
        """Return the job's current record, if it is still tracked."""
        with self._lock:
            self._prune()
            return self._jobs.get(job_id)

    def mark_running(self, job_id: str) -> None:
        """Record that the job has started."""
        self._update(job_id, status="running", started_at=self._clock())

    def mark_succeeded(self, job_id: str, result: Any) -> None:
        """Record the job's return value."""
        self._finish(job_id, "succeeded", result)

    def mark_failed(self, job_id: str) -> None:
        """Record that the job failed or never ran."""
        self._finish(job_id, "failed", None)

    def __len__(self) -> int:
        """Return the number of tracked jobs."""
        with self._lock:
            return len(self._jobs)

    def _finish(self, job_id: str, status: RecommendationJobState, result: Any) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None or record.finished:
                return
            self._jobs[job_id] = replace(
                record, status=status, result=result, finished_at=self._clock()
            )
            # Finished jobs are pruned oldest-finished first.
            self._jobs.move_to_end(job_id)
            self._prune()

    def _update(self, job_id: str, **changes: Any) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is not None and not record.finished:
                self._jobs[job_id] = replace(record, **changes)

    def _prune(self) -> None:
        cutoff = self._clock() - self._ttl
        finished = [
            (record.job_id, record.finished_at)
            for record in self._jobs.values()
            if record.finished_at is not None
        ]
        excess = len(finished) - self._max_finished
        for index, (job_id, finished_at) in enumerate(finished):
            if index < excess or finished_at < cutoff:
                del self._jobs[job_id]


_store = RecommendationJobStore()


def get_recommendation_job_store() -> RecommendationJobStore:
    """Return the process-wide store of in-process recommendation jobs."""
    return _store


class RecommendationJobService:
    """Enqueue embedding and index jobs and report their status."""

    def __init__(
        self,
        queue_orchestrator: QueueOrchestrator,
        *,
        gpu_available: bool,
        job_runner: Optional[InProcessJobRunner] = None,
        store: Optional[RecommendationJobStore] = None,
    ) -> None:
        """Bind the service to the shared queue and in-process job state.

        Args:
            queue_orchestrator: Picks Redis when it is configured.
            gpu_available: GPU flag for the services in-process jobs build.
            job_runner: Runner for in-process jobs; defaults to the
                process-wide one shared with generation jobs.
            store: Status store for in-process jobs; defaults to the
                process-wide one.

        """
        self._queue_orchestrator = queue_orchestrator
        self._gpu_available = gpu_available
        self._job_runner = job_runner
        self._store = store or get_recommendation_job_store()

    # ------------------------------------------------------------------
    # Enqueueing
    # ------------------------------------------------------------------
    def enqueue_embeddings_batch(
        self,
        adapter_ids: Optional[List[str]],
        *,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> RecommendationJobRead:
        """Queue embedding computation for ``adapter_ids`` (``None``: all active)."""
        return self._enqueue(
            "embeddings_batch",
            {
                "adapter_ids": adapter_ids,
                "force_recompute": force_recompute,
                "batch_size": batch_size,
            },
        )

    def enqueue_embedding(
        self, adapter_id: str, *, force_recompute: bool = False
    ) -> RecommendationJobRead:
        """Queue embedding computation for one adapter."""
        return self._enqueue(
            "embedding",
            {"adapter_id": adapter_id, "force_recompute": force_recompute},
        )

    def enqueue_index_rebuild(self, *, force: bool = False) -> RecommendationJobRead:
        """Queue a similarity index rebuild."""
        return self._enqueue("index_rebuild", {"force": force})

    def _enqueue(self, kind: str, params: Dict[str, Any]) -> RecommendationJobRead:
        job_id = uuid.uuid4().hex
        primary, _ = self._queue_orchestrator.get_backends()
        if isinstance(primary, RedisQueueBackend):
            try:
                return self._enqueue_rq(primary, job_id, kind, params)
            except Exception:
                logger.warning(
                    "Could not enqueue recommendation job %s on Redis; "
                    "running it in-process",
                    job_id,
                    exc_info=True,
                )
                primary.reset()
        return self._enqueue_in_process(job_id, kind, params)

    def _enqueue_rq(
        self,
        backend: RedisQueueBackend,
        job_id: str,
        kind: str,
        params: Dict[str, Any],
    ) -> RecommendationJobRead:
        job = backend.queue.enqueue_call(
            _TASKS[kind],
            kwargs=params,
            job_id=job_id,
            timeout=RQ_JOB_TIMEOUT_SECONDS,
            result_ttl=RESULT_TTL_SECONDS,
            failure_ttl=RESULT_TTL_SECONDS,
            meta={"kind": kind},
        )
        return _job_read(
            job_id=job_id,
            kind=kind,
            params=params,
            status="queued",
            created_at=job.created_at,
        )

    def _enqueue_in_process(
        self, job_id: str, kind: str, params: Dict[str, Any]
    ) -> RecommendationJobRead:
        record = InProcessJobRecord(job_id=job_id, kind=kind, params=params)
        self._store.add(record)

        # Run in a copy of the caller's context, as background tasks do, so a
        # scoped service container builder reaches the job.
        context = contextvars.copy_context()

        def start(job_id: str) -> "asyncio.Task[None]":
            return asyncio.get_running_loop().create_task(
                self._run_in_process(job_id, kind, params), context=context
            )

        runner = self._job_runner or get_in_process_job_runner()
        future = runner.submit(start, job_id)
        future.add_done_callback(lambda done: self._on_runner_done(job_id, done))
        return _job_read(
            job_id=job_id,
            kind=kind,
            params=params,
            status=record.status,
            created_at=record.created_at,
        )

    async def _run_in_process(
        self, job_id: str, kind: str, params: Dict[str, Any]
    ) -> None:
        # Imported here: the worker modules import the service package.
        from backend.workers import tasks
        from backend.workers.context import WorkerContext

        task = {
            "embeddings_batch": tasks.process_embeddings_batch_async,
            "embedding": tasks.compute_single_embedding_async,
            "index_rebuild": tasks.rebuild_similarity_index_async,
        }[kind]

        self._store.mark_running(job_id)
        try:
            context = WorkerContext(
                queue_orchestrator=self._queue_orchestrator,
                recommendation_gpu_available=self._gpu_available,
            )
            result = await task(**params, context=context)
        except Exception:
            logger.exception("Recommendation job %s (%s) failed", job_id, kind)
            self._store.mark_failed(job_id)
        else:
            self._store.mark_succeeded(job_id, result)

    def _on_runner_done(self, job_id: str, future: "Future[None]") -> None:
        # A finished job already has its final status, so this only affects
        # jobs cancelled or dropped when the runner stopped: report them as
        # failed rather than queued or running forever.
        self._store.mark_failed(job_id)

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------
    def get_job(self, job_id: str) -> Optional[RecommendationJobRead]:
        """Return the job's status, or ``None`` if it is unknown or expired."""
        if not _JOB_ID_PATTERN.match(job_id):
            return None

        record = self._store.get(job_id)
        if record is not None:
            return _job_read(
                job_id=record.job_id,
                kind=record.kind,
                params=record.params,
                status=record.status,
                raw_result=record.result,
                created_at=record.created_at,
                started_at=record.started_at,
                finished_at=record.finished_at,
            )

        primary, _ = self._queue_orchestrator.get_backends()
        if isinstance(primary, RedisQueueBackend):
            return self._get_rq_job(primary, job_id)
        return None

    def _get_rq_job(
        self, backend: RedisQueueBackend, job_id: str
    ) -> Optional[RecommendationJobRead]:
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        try:
            job = Job.fetch(job_id, connection=backend.queue.connection)
        except NoSuchJobError:
            return None

        kind = (job.meta or {}).get("kind")
        if kind not in _TASKS:
            # Delivery jobs share the queue; this endpoint only reports ours.
            return None

        rq_status = job.get_status(refresh=False)
        status = _RQ_STATES.get(getattr(rq_status, "value", rq_status), "queued")
        return _job_read(
            job_id=job_id,
            kind=kind,
            params=dict(job.kwargs or {}),
            status=status,
            raw_result=job.return_value() if status == "succeeded" else None,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.ended_at,
        )


__all__ = [
    "InProcessJobRecord",
    "RecommendationJobKind",
    "RecommendationJobService",
    "RecommendationJobStore",
    "get_recommendation_job_store",
]
