"""Database access for the job progress monitor."""

from __future__ import annotations

from contextlib import AbstractContextManager
from datetime import datetime
from typing import Callable, Optional, Sequence

from sqlmodel import Session

from backend.core.database import get_session_context
from backend.services.delivery_repository import DeliveryJobRepository

from .job_monitor import JobObservation, JobStateRepository, PersistedJob


class DeliveryJobStateRepository(JobStateRepository):
    """Load the delivery jobs the monitor tracks, one session per call."""

    def __init__(
        self,
        session_factory: Callable[
            [], AbstractContextManager[Session]
        ] = get_session_context,
    ) -> None:
        """Store the session factory used to access delivery data."""
        self._session_factory = session_factory

    def load_jobs(
        self,
        *,
        finished_since: Optional[datetime],
        job_ids: Sequence[str],
    ) -> JobObservation:
        """Return active jobs, jobs finished since a time and ``job_ids``."""
        with self._session_factory() as session:
            repository = DeliveryJobRepository(session)
            observed_at = repository.mapper.now()
            jobs = repository.list_monitored_jobs(
                finished_since=finished_since, job_ids=job_ids
            )
            return JobObservation(
                observed_at=observed_at,
                jobs=[
                    PersistedJob(
                        job_id=job.id,
                        status=job.status,
                        mode=job.mode,
                        params=repository.get_job_params(job),
                        result=repository.get_job_result(job),
                        started_at=job.started_at,
                        finished_at=job.finished_at,
                    )
                    for job in jobs
                ],
            )


__all__ = ["DeliveryJobStateRepository"]
