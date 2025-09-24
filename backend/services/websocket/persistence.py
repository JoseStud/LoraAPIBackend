"""Persistence adapters used by WebSocket job monitoring."""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Callable, Optional

import structlog
from sqlmodel import Session

from backend.core.database import get_session_context
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository

from .job_monitor import JobStateRepository, PersistedJobState

logger = structlog.get_logger(__name__)


class DeliveryJobStateRepository(JobStateRepository):
    """Load delivery job state using the DeliveryService API."""

    def __init__(
        self,
        session_factory: Callable[
            [], AbstractContextManager[Session]
        ] = get_session_context,
    ) -> None:
        """Store the session factory used to access delivery data."""
        self._session_factory = session_factory

    def get_job_state(self, job_id: str) -> Optional[PersistedJobState]:
        """Return persisted state for ``job_id`` using a service context."""
        with self._session_factory() as session:
            repository = DeliveryJobRepository(session)
            service = DeliveryService(repository)
            job = service.get_job(job_id)
            if job is None:
                return None

            result_payload = service.get_job_result(job)
            payload = result_payload if isinstance(result_payload, dict) else None

            return PersistedJobState(
                status=job.status,
                result=payload,
                started_at=job.started_at,
                finished_at=job.finished_at,
            )


__all__ = ["DeliveryJobStateRepository"]
