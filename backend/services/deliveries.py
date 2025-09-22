"""Delivery service for managing delivery jobs and queue hand-off."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from fastapi import BackgroundTasks
from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import DeliveryJob

if TYPE_CHECKING:  # pragma: no cover - used for type checking only
    from .queue import QueueBackend

_ACTIVE_STATUSES = {"pending", "running", "retrying"}


class DeliveryService:
    """Service for delivery job operations."""

    def __init__(
        self,
        db_session: Session,
        queue_backend: Optional["QueueBackend"] = None,
        fallback_queue_backend: Optional["QueueBackend"] = None,
    ) -> None:
        """Initialize DeliveryService with a DB session."""

        self.db_session = db_session
        self._queue_backend = queue_backend
        self._fallback_queue_backend = fallback_queue_backend

    def set_queue_backends(
        self,
        queue_backend: Optional["QueueBackend"],
        fallback_queue_backend: Optional["QueueBackend"],
    ) -> None:
        """Configure queue backends after initialization."""

        self._queue_backend = queue_backend
        self._fallback_queue_backend = fallback_queue_backend

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
        """Enqueue an existing job using the configured queue backends."""

        last_error: Optional[Exception] = None
        if self._queue_backend is not None:
            try:
                self._queue_backend.enqueue_delivery(
                    job_id,
                    background_tasks=background_tasks,
                    **enqueue_kwargs,
                )
                return
            except Exception as exc:  # pragma: no cover - defensive branch
                last_error = exc

        if self._fallback_queue_backend is not None:
            self._fallback_queue_backend.enqueue_delivery(
                job_id,
                background_tasks=background_tasks,
                **enqueue_kwargs,
            )
            return

        if last_error is not None:
            raise last_error
        raise RuntimeError("No queue backend configured for delivery jobs")

    def create_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> DeliveryJob:
        """Create and persist a DeliveryJob record."""

        dj = DeliveryJob(
            prompt=prompt,
            mode=mode,
            params=json.dumps(params or {}),
        )
        self.db_session.add(dj)
        self.db_session.commit()
        self.db_session.refresh(dj)
        return dj

    def get_job(self, job_id: str) -> Optional[DeliveryJob]:
        """Get a delivery job by ID."""

        return self.db_session.get(DeliveryJob, job_id)

    def list_jobs(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DeliveryJob]:
        """List delivery jobs with optional filtering and pagination."""

        q = select(DeliveryJob)
        if status:
            q = q.where(DeliveryJob.status == status)

        q = q.offset(offset).limit(limit).order_by(DeliveryJob.created_at.desc())
        return list(self.db_session.exec(q).all())

    def count_active_jobs(self) -> int:
        """Return the number of jobs currently in flight."""

        result = self.db_session.exec(
            select(func.count(DeliveryJob.id)).where(DeliveryJob.status.in_(_ACTIVE_STATUSES))
        ).one()
        return int(result or 0)

    def get_queue_statistics(self) -> Dict[str, int]:
        """Return queue statistics derived from the delivery jobs table."""

        total_jobs = self.db_session.exec(select(func.count(DeliveryJob.id))).one() or 0
        active_jobs = self.count_active_jobs()
        running_jobs = (
            self.db_session.exec(
                select(func.count(DeliveryJob.id)).where(DeliveryJob.status == "running")
            ).one()
            or 0
        )
        failed_jobs = (
            self.db_session.exec(
                select(func.count(DeliveryJob.id)).where(DeliveryJob.status == "failed")
            ).one()
            or 0
        )

        return {
            "total": int(total_jobs),
            "active": int(active_jobs),
            "running": int(running_jobs),
            "failed": int(failed_jobs),
        }

    def get_recent_activity(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return a recent activity feed derived from delivery jobs."""

        q = (
            select(DeliveryJob)
            .order_by(DeliveryJob.created_at.desc())
            .limit(max(1, limit))
        )
        jobs = list(self.db_session.exec(q).all())

        def _status_icon(status: str) -> str:
            return {
                "pending": "⏳",
                "running": "🚀",
                "retrying": "🔁",
                "succeeded": "✅",
                "failed": "⚠️",
                "cancelled": "🚫",
            }.get(status, "ℹ️")

        activities: List[Dict[str, Any]] = []
        for job in jobs:
            status = job.status or "pending"
            created_at = job.created_at or datetime.now(timezone.utc)
            message = f"Delivery job '{job.prompt}' {status}"
            activities.append(
                {
                    "id": job.id,
                    "type": status,
                    "status": status,
                    "message": message,
                    "mode": job.mode,
                    "prompt": job.prompt,
                    "timestamp": created_at.isoformat(),
                    "icon": _status_icon(status),
                }
            )

        return activities

    def update_job_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[DeliveryJob]:
        """Update a delivery job's status and result."""

        job = self.get_job(job_id)
        if job is None:
            return None

        job.status = status
        stored_result: Optional[Dict[str, Any]] = None
        if result is not None:
            stored_result = dict(result)

        if error is not None:
            if stored_result is None:
                stored_result = {"error": error}
            else:
                stored_result = {**stored_result, "error": error}

        if stored_result is not None:
            job.result = json.dumps(stored_result)

        # Set timestamps based on status
        if status == "running" and job.started_at is None:
            from datetime import datetime, timezone

            job.started_at = datetime.now(timezone.utc)
        elif status in ("succeeded", "failed", "cancelled") and job.finished_at is None:
            from datetime import datetime, timezone

            job.finished_at = datetime.now(timezone.utc)

        self.db_session.add(job)
        self.db_session.commit()
        self.db_session.refresh(job)
        return job

    def get_job_params(self, job: DeliveryJob) -> Dict[str, Any]:
        """Parse and return job parameters as dict."""

        try:
            return json.loads(job.params) if job.params else {}
        except json.JSONDecodeError:
            return {}

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict[str, Any]]:
        """Parse and return job result as dict."""

        if not job.result:
            return None

        try:
            return json.loads(job.result)
        except json.JSONDecodeError:
            return None
