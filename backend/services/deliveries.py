"""Delivery service for managing delivery jobs and queue hand-off."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

from fastapi import BackgroundTasks

from backend.models import DeliveryJob

from .delivery_repository import DeliveryJobRepository

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from .queue import QueueOrchestrator


class DeliveryService:
    """Service for delivery job operations."""

    def __init__(
        self,
        repository: DeliveryJobRepository,
        queue_orchestrator: Optional["QueueOrchestrator"] = None,
    ) -> None:
        self._repository = repository
        self._queue_orchestrator = queue_orchestrator

    @property
    def repository(self) -> DeliveryJobRepository:
        return self._repository

    @property
    def queue_orchestrator(self) -> Optional["QueueOrchestrator"]:
        return self._queue_orchestrator

    @property
    def db_session(self):
        """Expose the active database session used by the repository."""

        return self._repository.session

    def set_queue_orchestrator(self, orchestrator: Optional["QueueOrchestrator"]) -> None:
        """Configure or replace the queue orchestrator."""

        self._queue_orchestrator = orchestrator

    def schedule_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
        background_tasks: Optional[BackgroundTasks] = None,
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
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> None:
        """Enqueue an existing job using the configured queue orchestrator."""

        orchestrator = self._require_orchestrator()
        orchestrator.enqueue_delivery(
            job_id,
            background_tasks=background_tasks,
            **enqueue_kwargs,
        )

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

    def count_active_jobs(self) -> int:
        """Return the number of jobs currently in flight."""

        return self._repository.count_active_jobs()

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

    def get_job_params(self, job: DeliveryJob) -> Dict[str, Any]:
        """Parse and return job parameters as dict."""

        return self._repository.get_job_params(job)

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict[str, Any]]:
        """Parse and return job result as dict."""

        return self._repository.get_job_result(job)

    def _require_orchestrator(self) -> "QueueOrchestrator":
        if self._queue_orchestrator is None:
            raise RuntimeError("Queue orchestrator is not configured for delivery jobs")
        return self._queue_orchestrator
