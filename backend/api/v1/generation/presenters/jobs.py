"""Presentation helpers for generation jobs."""

from __future__ import annotations

from typing import Any, Dict

from backend.models import DeliveryJob
from backend.schemas import DeliveryJobResult, GenerationJobStatus
from backend.services.generation import (
    GenerationCoordinator,
    normalize_generation_status,
)
from backend.utils.images import to_browser_image_src

__all__ = ["build_active_job"]


def _with_browser_images(job_id: str, result: DeliveryJobResult) -> Dict[str, Any]:
    """Return the stored result with ``images`` turned into browser-loadable sources.

    Stored file references become the result image route and legacy base64
    becomes a data URI. Entries with no loadable source are dropped rather
    than exposing internal values.
    """
    payload = result.to_payload()
    if result.images is None:
        return payload
    sources = (
        to_browser_image_src(image, job_id=job_id, index=index)
        for index, image in enumerate(result.images)
    )
    return {**payload, "images": [src for src in sources if src]}


def build_active_job(
    job: DeliveryJob,
    coordinator: GenerationCoordinator,
) -> GenerationJobStatus:
    """Return an API-facing representation of an active job."""
    serialized = coordinator.serialize_delivery_job(job)
    params = serialized.params

    return GenerationJobStatus(
        id=job.id,
        jobId=job.id,
        prompt=params.get("prompt") or job.prompt,
        status=normalize_generation_status(job.status),
        progress=serialized.progress,
        message=serialized.message,
        error=serialized.error,
        params=params,
        created_at=job.created_at,
        startTime=job.started_at or job.created_at,
        finished_at=job.finished_at,
        result=_with_browser_images(job.id, serialized.result) or None,
    )
