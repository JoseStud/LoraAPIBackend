"""Delivery service for managing delivery jobs and queue hand-off."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence

from backend.models import DeliveryJob

from .delivery_repository import (
    CLAIMABLE_STATUSES,
    DeliveryJobRepository,
)
from .delivery_results import DeliveryResultManager, ResultArchive, ResultDownload
from .queue import QueueUnavailableError

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from .generation import GenerationCoordinator
    from .queue import QueueOrchestrator, TaskScheduler
    from .storage import StorageService

QUEUE_UNAVAILABLE_RESULT: Dict[str, Any] = {
    "status": "failed",
    "error_message": "The job queue was unavailable, so the job was never queued",
}


class DeliveryService:
    """Service for delivery job operations."""

    def __init__(
        self,
        repository: DeliveryJobRepository,
        queue_orchestrator: Optional["QueueOrchestrator"] = None,
        *,
        result_manager: Optional[DeliveryResultManager] = None,
    ) -> None:
        """Initialise delivery dependencies and optional orchestrator."""
        self._repository = repository
        self._queue_orchestrator = queue_orchestrator
        self._result_manager = result_manager or DeliveryResultManager(repository)

    @property
    def repository(self) -> DeliveryJobRepository:
        """Return the repository handling delivery persistence."""
        return self._repository

    @property
    def queue_orchestrator(self) -> Optional["QueueOrchestrator"]:
        """Return the configured queue orchestrator, if any."""
        return self._queue_orchestrator

    @property
    def result_manager(self) -> DeliveryResultManager:
        """Return the delivery result manager."""
        return self._result_manager

    @property
    def db_session(self):
        """Expose the active database session used by the repository."""
        return self._repository.session

    def set_queue_orchestrator(
        self, orchestrator: Optional["QueueOrchestrator"]
    ) -> None:
        """Configure or replace the queue orchestrator."""
        self._queue_orchestrator = orchestrator

    def schedule_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
        background_tasks: Optional[TaskScheduler] = None,
        **enqueue_kwargs: Any,
    ) -> DeliveryJob:
        """Create a delivery job and enqueue it for processing."""
        job = self.create_job(prompt, mode, params or {})
        self.enqueue_job(job.id, background_tasks=background_tasks, **enqueue_kwargs)
        return job

    def enqueue_job(
        self,
        job_id: str,
        *,
        background_tasks: Optional[TaskScheduler] = None,
        **enqueue_kwargs: Any,
    ) -> None:
        """Enqueue an existing job using the configured queue orchestrator.

        When the queue rejects the job it is failed, if it is still pending,
        and :class:`QueueUnavailableError` is re-raised; otherwise nothing
        would ever run it and it would stay pending.
        """
        orchestrator = self._require_orchestrator()
        try:
            orchestrator.enqueue_delivery(
                job_id,
                background_tasks=background_tasks,
                **enqueue_kwargs,
            )
        except QueueUnavailableError:
            self._repository.transition_job_status(
                job_id,
                "failed",
                from_statuses=("pending",),
                result=QUEUE_UNAVAILABLE_RESULT,
            )
            raise

    def create_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> DeliveryJob:
        """Create and persist a DeliveryJob record."""
        return self._repository.create_job(prompt, mode, params or {})

    def get_job(self, job_id: str) -> Optional[DeliveryJob]:
        """Get a delivery job by ID."""
        return self._repository.get_job(job_id)

    def list_jobs(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DeliveryJob]:
        """List delivery jobs with optional filtering and pagination."""
        return self._repository.list_jobs(status=status, limit=limit, offset=offset)

    def list_jobs_by_statuses(
        self, statuses: Sequence[str], *, limit: int
    ) -> List[DeliveryJob]:
        """List delivery jobs matching any of ``statuses`` ordered by recency."""
        return self._repository.list_jobs_by_statuses(statuses, limit=limit)

    def count_active_jobs(self) -> int:
        """Return the number of jobs currently in flight."""
        return self._repository.count_active_jobs()

    def get_result_statistics(self) -> Dict[str, Any]:
        """Return counts, average rating and favourites for finished results."""
        return self._repository.get_result_statistics()

    def get_queue_statistics(self) -> Dict[str, int]:
        """Return queue statistics derived from the delivery jobs table."""
        return self._repository.get_queue_statistics()

    def get_recent_activity(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return a recent activity feed derived from delivery jobs."""
        return self._repository.get_recent_activity(limit=limit)

    def update_job_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[DeliveryJob]:
        """Update a delivery job's status and result."""
        return self._repository.update_job_status(
            job_id,
            status,
            result=result,
            error=error,
        )

    def claim_job(self, job_id: str) -> Optional[DeliveryJob]:
        """Mark a pending or retrying job as running.

        Returns ``None`` when the job is missing or not waiting to run, for
        example because it was cancelled or another runner already took it.
        """
        return self._repository.transition_job_status(
            job_id, "running", from_statuses=CLAIMABLE_STATUSES
        )

    def finish_job(
        self, job_id: str, status: str, result: Optional[Dict[str, Any]] = None
    ) -> Optional[DeliveryJob]:
        """Record the outcome of a running job.

        Returns ``None`` when the job is no longer running (it was cancelled or
        failed by recovery while it ran); its stored status is then kept.
        """
        return self._repository.transition_job_status(
            job_id, status, from_statuses=("running",), result=result
        )

    def cancel_job(self, job_id: str) -> Optional[str]:
        """Cancel an active job and return the status it had, or ``None``."""
        for previous in ("running", "pending", "retrying"):
            cancelled = self._repository.transition_job_status(
                job_id,
                "cancelled",
                from_statuses=(previous,),
                result={"status": "cancelled"},
            )
            if cancelled is not None:
                return previous
        return None

    def fail_running_jobs(
        self, *, older_than: timedelta, result: Dict[str, Any]
    ) -> List[DeliveryJob]:
        """Fail jobs that have been running for longer than ``older_than``."""
        cutoff = self._repository.mapper.now() - older_than
        failed: List[DeliveryJob] = []
        for job in self._repository.list_jobs_started_before("running", cutoff):
            updated = self._repository.transition_job_status(
                job.id, "failed", from_statuses=("running",), result=result
            )
            if updated is not None:
                failed.append(updated)
        return failed

    def list_claimable_jobs(self, *, limit: int = 1000) -> List[DeliveryJob]:
        """Return jobs waiting to run, oldest first."""
        jobs = self._repository.list_jobs_by_statuses(CLAIMABLE_STATUSES, limit=limit)
        return sorted(jobs, key=lambda job: job.created_at)

    def get_job_params(self, job: DeliveryJob) -> Dict[str, Any]:
        """Parse and return job parameters as dict."""
        return self._repository.get_job_params(job)

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict[str, Any]]:
        """Parse and return job result as dict."""
        return self._repository.get_job_result(job)

    def set_job_rating(
        self, job_id: str, rating: Optional[int]
    ) -> Optional[DeliveryJob]:
        """Update the stored rating for ``job_id``."""
        return self._repository.set_job_rating(job_id, rating)

    def set_job_favorite(self, job_id: str, is_favorite: bool) -> Optional[DeliveryJob]:
        """Update the favourite flag for ``job_id``."""
        return self._repository.set_job_favorite(job_id, is_favorite)

    def bulk_set_job_favorite(self, job_ids: Sequence[str], is_favorite: bool) -> int:
        """Apply favourite state updates to multiple jobs."""
        return self._repository.bulk_set_job_favorite(job_ids, is_favorite)

    # ------------------------------------------------------------------
    # Result management helpers
    # ------------------------------------------------------------------
    def delete_job_result(
        self,
        job_id: str,
        *,
        storage: "StorageService",
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> bool:
        """Remove a persisted result and delete the associated job record."""
        job = self.get_job(job_id)
        if job is None:
            return False

        self.remove_job_assets(job, storage, coordinator=coordinator)
        return self._repository.delete_job(job_id)

    def bulk_delete_job_results(
        self,
        job_ids: Sequence[str],
        *,
        storage: "StorageService",
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> int:
        """Bulk delete results by removing assets then deleting rows."""
        jobs = self._repository.list_jobs_by_ids(job_ids)
        if not jobs:
            return 0

        for job in jobs:
            self.remove_job_assets(job, storage, coordinator=coordinator)

        deleted = self._repository.delete_jobs([job.id for job in jobs])
        return deleted

    def build_results_archive(
        self,
        job_ids: Sequence[str],
        *,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        include_metadata: bool = True,
        chunk_size: int = 64 * 1024,
        spooled_file_max_size: int = 32 * 1024 * 1024,
    ) -> Optional[ResultArchive]:
        """Create a streaming archive for the specified results."""
        return self.result_manager.build_archive(
            job_ids,
            storage=storage,
            coordinator=coordinator,
            include_metadata=include_metadata,
            chunk_size=chunk_size,
            spooled_file_max_size=spooled_file_max_size,
        )

    def build_result_download(
        self,
        job: DeliveryJob,
        *,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        chunk_size: int = 64 * 1024,
    ) -> Optional[ResultDownload]:
        """Prepare a download payload for the primary asset of ``job``."""
        return self.result_manager.build_download(
            job,
            storage=storage,
            coordinator=coordinator,
            chunk_size=chunk_size,
        )

    def remove_job_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[str]:
        """Remove persisted files referenced by a job's result payload."""
        return self.result_manager.remove_assets(
            job,
            storage,
            coordinator=coordinator,
        )

    def _require_orchestrator(self) -> "QueueOrchestrator":
        if self._queue_orchestrator is None:
            raise RuntimeError("Queue orchestrator is not configured for delivery jobs")
        return self._queue_orchestrator
