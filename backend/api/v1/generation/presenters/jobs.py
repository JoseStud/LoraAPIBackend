"""Presentation helpers for generation jobs."""

from __future__ import annotations

from typing import Any, Dict

from backend.models import DeliveryJob
from backend.schemas import GenerationJobStatus
from backend.services.generation import (
    GenerationCoordinator,
    normalize_generation_status,
)
from backend.utils.images import to_browser_image_src

__all__ = ["build_active_job"]


def _with_browser_images(job_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
    """Return ``result`` with ``images`` turned into browser-loadable sources.

    Stored file references become the result image route and legacy base64
    becomes a data URI. Entries with no loadable source are dropped rather
    than exposing internal values.
    """
    images = result.get("images")
    if not isinstance(images, list):
        return result
    sources = (
        to_browser_image_src(image, job_id=job_id, index=index)
        for index, image in enumerate(images)
        if isinstance(image, str)
    )
    return {**result, "images": [src for src in sources if src]}


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
        result=_with_browser_images(job.id, result_payload) or None,
    )
