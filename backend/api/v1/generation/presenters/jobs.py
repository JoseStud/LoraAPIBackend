"""Presentation helpers for generation jobs."""

from __future__ import annotations

from backend.models import DeliveryJob
from backend.schemas import GenerationJobStatus
from backend.services.generation import GenerationCoordinator, normalize_generation_status

__all__ = ["build_active_job"]


def build_active_job(
    job: DeliveryJob,
    coordinator: GenerationCoordinator,
) -> GenerationJobStatus:
    """Return an API-facing representation of an active job."""
    serialized = coordinator.serialize_delivery_job(job)
    params = serialized.get("params") or {}
    result_payload = serialized.get("result") or {}

    return GenerationJobStatus(
        id=job.id,
        jobId=job.id,
        prompt=params.get("prompt") or job.prompt,
        status=normalize_generation_status(job.status),
        progress=serialized.get("progress", 0.0),
        message=serialized.get("message"),
        error=serialized.get("error"),
        params=params,
        created_at=job.created_at,
        startTime=job.started_at or job.created_at,
        finished_at=job.finished_at,
        result=result_payload or None,
    )
