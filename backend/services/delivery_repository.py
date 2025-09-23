"""Persistence helpers for :class:`~backend.services.deliveries.DeliveryService`."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import DeliveryJob

_ACTIVE_STATUSES = {"pending", "running", "retrying"}


class DeliveryJobMapper:
    """Serialize and deserialize database columns for delivery jobs."""

    def __init__(self, *, now: Optional[Callable[[], datetime]] = None) -> None:
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
        self._session = session
        self._mapper = mapper or DeliveryJobMapper()

    @property
    def mapper(self) -> DeliveryJobMapper:
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
        return self._session.get(DeliveryJob, job_id)

    def list_jobs(
        self,
        *,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DeliveryJob]:
        query = select(DeliveryJob)
        if status:
            query = query.where(DeliveryJob.status == status)

        query = query.offset(offset).limit(limit).order_by(DeliveryJob.created_at.desc())
        return list(self._session.exec(query).all())

    def count_active_jobs(self) -> int:
        result = self._session.exec(
            select(func.count(DeliveryJob.id)).where(DeliveryJob.status.in_(_ACTIVE_STATUSES)),
        ).one()
        return int(result or 0)

    def get_queue_statistics(self) -> Dict[str, int]:
        total_jobs = self._session.exec(select(func.count(DeliveryJob.id))).one() or 0
        active_jobs = self.count_active_jobs()
        running_jobs = (
            self._session.exec(
                select(func.count(DeliveryJob.id)).where(DeliveryJob.status == "running"),
            ).one()
            or 0
        )
        failed_jobs = (
            self._session.exec(
                select(func.count(DeliveryJob.id)).where(DeliveryJob.status == "failed"),
            ).one()
            or 0
        )

        return {
            "total": int(total_jobs),
            "active": int(active_jobs),
            "running": int(running_jobs),
            "failed": int(failed_jobs),
        }

    def get_recent_activity(self, *, limit: int = 10) -> List[Dict[str, Any]]:
        query = (
            select(DeliveryJob)
            .order_by(DeliveryJob.created_at.desc())
            .limit(max(1, limit))
        )
        jobs = list(self._session.exec(query).all())
        return [self._mapper.build_activity(job) for job in jobs]

    def update_job_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[DeliveryJob]:
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
        return self._mapper.deserialize_params(job.params)

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict[str, Any]]:
        return self._mapper.deserialize_result(job.result)


__all__ = ["DeliveryJobRepository", "DeliveryJobMapper"]

