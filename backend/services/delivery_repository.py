"""Persistence helpers for :class:`~backend.services.deliveries.DeliveryService`."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence

from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import DeliveryJob

_ACTIVE_STATUSES = {"pending", "running", "retrying"}


class DeliveryJobMapper:
    """Serialize and deserialize database columns for delivery jobs."""

    def __init__(self, *, now: Optional[Callable[[], datetime]] = None) -> None:
        """Store the callable used for timestamp generation."""
        self._now = now or (lambda: datetime.now(timezone.utc))

    def serialize_params(self, params: Optional[Dict[str, Any]]) -> str:
        """Convert job parameter payloads into a JSON string."""
        return json.dumps(params or {})

    def deserialize_params(self, params: Optional[str]) -> Dict[str, Any]:
        """Convert the stored JSON params into a dictionary."""
        if not params:
            return {}

        try:
            data = json.loads(params)
        except json.JSONDecodeError:  # pragma: no cover - defensive guard
            return {}
        if isinstance(data, dict):
            return data
        return {}

    def serialize_result(
        self,
        result: Optional[Dict[str, Any]],
        error: Optional[str],
    ) -> Optional[str]:
        """Merge result payloads and error messages into a JSON string."""
        payload: Optional[Dict[str, Any]] = None
        if result is not None:
            payload = dict(result)

        if error is not None:
            if payload is None:
                payload = {"error": error}
            else:
                payload["error"] = error

        if payload is None:
            return None

        return json.dumps(payload)

    def deserialize_result(self, result: Optional[str]) -> Optional[Dict[str, Any]]:
        """Decode the stored result JSON blob."""
        if not result:
            return None

        try:
            data = json.loads(result)
        except json.JSONDecodeError:  # pragma: no cover - defensive guard
            return None
        if isinstance(data, dict):
            return data
        return None

    def apply_status(self, job: DeliveryJob, status: str) -> None:
        """Update job status and lifecycle timestamps."""
        job.status = status
        now = self._now()
        if status == "running" and job.started_at is None:
            job.started_at = now
        elif status in {"succeeded", "failed", "cancelled"} and job.finished_at is None:
            job.finished_at = now

    def normalize_rating(self, rating: Optional[int]) -> Optional[int]:
        """Validate and normalize user-provided rating values."""
        if rating is None:
            return None

        try:
            normalized = int(rating)
        except (TypeError, ValueError) as exc:  # pragma: no cover - defensive guard
            raise ValueError("Rating must be an integer between 0 and 5") from exc

        if not 0 <= normalized <= 5:
            raise ValueError("Rating must be between 0 and 5")

        return normalized

    def apply_rating(self, job: DeliveryJob, rating: Optional[int]) -> None:
        """Persist ``rating`` alongside its updated timestamp."""
        job.rating = rating
        job.rating_updated_at = self._now() if rating is not None else None

    def apply_favorite(self, job: DeliveryJob, is_favorite: bool) -> None:
        """Persist favourite state alongside the updated timestamp."""
        job.is_favorite = bool(is_favorite)
        job.favorite_updated_at = self._now() if job.is_favorite else None

    def build_activity(self, job: DeliveryJob) -> Dict[str, Any]:
        """Create the activity feed payload for ``job``."""
        status = job.status or "pending"
        created_at = job.created_at or self._now()
        return {
            "id": job.id,
            "type": status,
            "status": status,
            "message": f"Delivery job '{job.prompt}' {status}",
            "mode": job.mode,
            "prompt": job.prompt,
            "timestamp": created_at.isoformat(),
            "icon": self._status_icon(status),
        }

    @staticmethod
    def _status_icon(status: str) -> str:
        return {
            "pending": "⏳",
            "running": "🚀",
            "retrying": "🔁",
            "succeeded": "✅",
            "failed": "⚠️",
            "cancelled": "🚫",
        }.get(status, "ℹ️")


class DeliveryJobRepository:
    """Repository for persisting and retrieving delivery jobs."""

    def __init__(
        self,
        session: Session,
        *,
        mapper: Optional[DeliveryJobMapper] = None,
    ) -> None:
        """Initialise repository with a session and optional mapper."""
        self._session = session
        self._mapper = mapper or DeliveryJobMapper()

    @property
    def mapper(self) -> DeliveryJobMapper:
        """Return the mapper responsible for serialization helpers."""
        return self._mapper

    @property
    def session(self) -> Session:
        """Expose the underlying database session for collaborators."""
        return self._session

    def create_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> DeliveryJob:
        """Persist a new delivery job and return the stored model."""
        job = DeliveryJob(
            prompt=prompt,
            mode=mode,
            params=self._mapper.serialize_params(params or {}),
        )
        self._session.add(job)
        self._session.commit()
        self._session.refresh(job)
        return job

    def get_job(self, job_id: str) -> Optional[DeliveryJob]:
        """Retrieve a delivery job by identifier."""
        return self._session.get(DeliveryJob, job_id)

    def list_jobs(
        self,
        *,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DeliveryJob]:
        """List jobs with optional status filtering and pagination."""
        query = select(DeliveryJob)
        if status:
            query = query.where(DeliveryJob.status == status)

        query = (
            query.offset(offset).limit(limit).order_by(DeliveryJob.created_at.desc())
        )
        return list(self._session.exec(query).all())

    def list_jobs_by_statuses(
        self, statuses: Sequence[str], limit: int
    ) -> List[DeliveryJob]:
        """Return jobs matching ``statuses`` ordered by recency."""
        if limit <= 0:
            return []

        normalized_statuses = [
            status for status in statuses if isinstance(status, str) and status
        ]
        if not normalized_statuses:
            return []

        unique_statuses = tuple(dict.fromkeys(normalized_statuses))

        order_expression = func.coalesce(
            DeliveryJob.started_at, DeliveryJob.created_at
        ).desc()

        query = (
            select(DeliveryJob)
            .where(DeliveryJob.status.in_(unique_statuses))
            .order_by(order_expression, DeliveryJob.created_at.desc())
            .limit(limit)
        )
        return list(self._session.exec(query).all())

    def count_active_jobs(self) -> int:
        """Return the number of jobs considered active."""
        result = (
            self._session.execute(
                select(func.count(DeliveryJob.id)).where(
                    DeliveryJob.status.in_(_ACTIVE_STATUSES)
                )
            ).scalar_one_or_none()
            or 0
        )
        return int(result)

    def get_queue_statistics(self) -> Dict[str, int]:
        """Summarise queue-oriented counts for dashboards."""
        total_jobs = (
            self._session.execute(select(func.count(DeliveryJob.id))).scalar_one_or_none()
            or 0
        )
        active_jobs = self.count_active_jobs()
        running_jobs = (
            self._session.execute(
                select(func.count(DeliveryJob.id)).where(
                    DeliveryJob.status == "running"
                )
            ).scalar_one_or_none()
            or 0
        )
        failed_jobs = (
            self._session.execute(
                select(func.count(DeliveryJob.id)).where(
                    DeliveryJob.status == "failed"
                )
            ).scalar_one_or_none()
            or 0
        )

        return {
            "total": int(total_jobs),
            "active": int(active_jobs),
            "running": int(running_jobs),
            "failed": int(failed_jobs),
        }

    def get_recent_activity(self, *, limit: int = 10) -> List[Dict[str, Any]]:
        """Return recent job activity formatted for the dashboard feed."""
        query = (
            select(DeliveryJob)
            .order_by(DeliveryJob.created_at.desc())
            .limit(max(1, limit))
        )
        jobs = list(self._session.exec(query).all())
        return [self._mapper.build_activity(job) for job in jobs]

    def set_job_rating(
        self, job_id: str, rating: Optional[int]
    ) -> Optional[DeliveryJob]:
        """Update the rating value for ``job_id``."""
        job = self.get_job(job_id)
        if job is None:
            return None

        normalized = self._mapper.normalize_rating(rating)
        self._mapper.apply_rating(job, normalized)
        self._session.add(job)
        self._session.commit()
        self._session.refresh(job)
        return job

    def set_job_favorite(self, job_id: str, is_favorite: bool) -> Optional[DeliveryJob]:
        """Toggle favourite state for ``job_id``."""
        job = self.get_job(job_id)
        if job is None:
            return None

        self._mapper.apply_favorite(job, is_favorite)
        self._session.add(job)
        self._session.commit()
        self._session.refresh(job)
        return job

    def bulk_set_job_favorite(self, job_ids: Sequence[str], is_favorite: bool) -> int:
        """Set favourite state for multiple delivery jobs."""
        jobs = self.list_jobs_by_ids(job_ids)
        if not jobs:
            return 0

        for job in jobs:
            self._mapper.apply_favorite(job, is_favorite)
            self._session.add(job)

        self._session.commit()
        return len(jobs)

    def list_jobs_by_ids(self, job_ids: Sequence[str]) -> List[DeliveryJob]:
        """Return delivery jobs matching ``job_ids`` preserving database order."""
        if not job_ids:
            return []

        normalized_ids = [str(job_id) for job_id in job_ids]

        query = select(DeliveryJob).where(DeliveryJob.id.in_(normalized_ids))
        jobs = list(self._session.exec(query).all())
        if not jobs:
            return []

        jobs_by_id = {job.id: job for job in jobs}
        return [jobs_by_id[job_id] for job_id in normalized_ids if job_id in jobs_by_id]

    def delete_job(self, job_id: str) -> bool:
        """Delete a delivery job and commit the change."""
        job = self.get_job(job_id)
        if job is None:
            return False

        self._session.delete(job)
        self._session.commit()
        return True

    def delete_jobs(self, job_ids: Sequence[str]) -> int:
        """Bulk delete delivery jobs by identifier."""
        jobs = self.list_jobs_by_ids(job_ids)
        if not jobs:
            return 0

        for job in jobs:
            self._session.delete(job)

        self._session.commit()
        return len(jobs)

    def bulk_update_jobs(
        self,
        job_ids: Sequence[str],
        *,
        status: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> int:
        """Apply status/result updates to multiple jobs at once."""
        jobs = self.list_jobs_by_ids(job_ids)
        if not jobs:
            return 0

        for job in jobs:
            if status is not None:
                self._mapper.apply_status(job, status)
            if result is not None or error is not None:
                job.result = self._mapper.serialize_result(result, error)
            self._session.add(job)

        self._session.commit()
        return len(jobs)

    def update_job_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[DeliveryJob]:
        """Update stored job status/result fields and return the job."""
        job = self.get_job(job_id)
        if job is None:
            return None

        serialized_result = self._mapper.serialize_result(result, error)
        if serialized_result is not None:
            job.result = serialized_result

        self._mapper.apply_status(job, status)

        self._session.add(job)
        self._session.commit()
        self._session.refresh(job)
        return job

    def get_job_params(self, job: DeliveryJob) -> Dict[str, Any]:
        """Decode the serialized parameter payload for ``job``."""
        return self._mapper.deserialize_params(job.params)

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict[str, Any]]:
        """Decode the serialized result payload for ``job``."""
        return self._mapper.deserialize_result(job.result)


__all__ = ["DeliveryJobRepository", "DeliveryJobMapper"]
