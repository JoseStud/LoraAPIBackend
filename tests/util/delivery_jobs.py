"""Test helpers for putting delivery jobs into a given state."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.models import DeliveryJob
from backend.services.deliveries import DeliveryService


def set_job_status(
    service: DeliveryService,
    job_id: str,
    status: str,
    result: Optional[Dict[str, Any]] = None,
) -> DeliveryJob:
    """Move ``job_id`` straight to ``status`` (and ``result``) for test setup.

    Production code changes status only through ``claim_job``, ``finish_job``
    and ``cancel_job``. Tests that need an arbitrary starting state use the
    repository's guarded transition from the job's current status, so they
    exercise the same write path and lifecycle timestamps.
    """
    job = service.get_job(job_id)
    assert job is not None, f"unknown job {job_id}"
    updated = service.repository.transition_job_status(
        job_id, status, from_statuses=(job.status,), result=result
    )
    assert updated is not None, f"could not move job {job_id} to {status}"
    return updated
