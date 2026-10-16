"""Presentation helpers for generation results."""

from __future__ import annotations

from typing import Optional

from backend.models import DeliveryJob
from backend.schemas import DeliveryJobResult, GenerationResultSummary
from backend.services.generation import (
    GenerationCoordinator,
    normalize_generation_status,
)
from backend.utils.images import to_browser_image_src

__all__ = ["build_result"]


def _first_image_url(job_id: str, result: DeliveryJobResult) -> Optional[str]:
    if not result.images:
        return None
    return to_browser_image_src(result.images[0], job_id=job_id, index=0)


def build_result(
    job: DeliveryJob,
    coordinator: GenerationCoordinator,
) -> GenerationResultSummary:
    """Return an API-facing representation of a completed generation job."""
    serialized = coordinator.serialize_delivery_job(job)
    params = serialized.params
    result = serialized.result

    # A thumbnail is not one of the indexed ``images``, so a stored file
    # reference has no route and yields ``None``; clients fall back to
    # ``image_url``.
    thumbnail_url = (
        to_browser_image_src(result.thumbnail_url, job_id=job.id, index=None)
        if result.thumbnail_url is not None
        else None
    )

    return GenerationResultSummary(
        id=job.id,
        job_id=job.id,
        prompt=params.get("prompt") or job.prompt,
        negative_prompt=params.get("negative_prompt"),
        status=normalize_generation_status(job.status),
        image_url=_first_image_url(job.id, result),
        thumbnail_url=thumbnail_url,
        width=params.get("width"),
        height=params.get("height"),
        steps=params.get("steps"),
        cfg_scale=params.get("cfg_scale"),
        seed=params.get("seed"),
        created_at=job.created_at,
        finished_at=job.finished_at,
        generation_info=result.generation_info,
        rating=job.rating,
        is_favorite=bool(job.is_favorite),
        rating_updated_at=job.rating_updated_at,
        favorite_updated_at=job.favorite_updated_at,
    )
