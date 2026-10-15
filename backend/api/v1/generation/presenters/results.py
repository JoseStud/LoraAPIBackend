"""Presentation helpers for generation results."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from backend.models import DeliveryJob
from backend.schemas import GenerationResultSummary
from backend.services.generation import (
    GenerationCoordinator,
    normalize_generation_status,
)
from backend.utils.images import to_browser_image_src

__all__ = ["build_result"]


def _extract_image_url(job_id: str, result_payload: Dict[str, Any]) -> Optional[str]:
    images = result_payload.get("images")
    if isinstance(images, list) and images:
        first_image = images[0]
        if isinstance(first_image, str):
            return to_browser_image_src(first_image, job_id=job_id, index=0)
    return None


def _coerce_generation_info(result_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    generation_info = result_payload.get("generation_info")
    if isinstance(generation_info, dict):
        return generation_info

    if isinstance(generation_info, str):
        try:
            parsed = json.loads(generation_info)
        except (TypeError, ValueError):
            return None
        return parsed if isinstance(parsed, dict) else None

    return None


def build_result(
    job: DeliveryJob,
    coordinator: GenerationCoordinator,
) -> GenerationResultSummary:
    """Return an API-facing representation of a completed generation job."""
    serialized = coordinator.serialize_delivery_job(job)
    params = serialized.get("params") or {}
    result_payload = serialized.get("result") or {}

    # A thumbnail is not one of the indexed ``images``, so a stored file
    # reference has no route and yields ``None``; clients fall back to
    # ``image_url``.
    thumbnail_url = result_payload.get("thumbnail_url")
    thumbnail_url = (
        to_browser_image_src(thumbnail_url, job_id=job.id, index=None)
        if isinstance(thumbnail_url, str)
        else None
    )

    return GenerationResultSummary(
        id=job.id,
        job_id=job.id,
        prompt=params.get("prompt") or job.prompt,
        negative_prompt=params.get("negative_prompt"),
        status=normalize_generation_status(job.status),
        image_url=_extract_image_url(job.id, result_payload),
        thumbnail_url=thumbnail_url,
        width=params.get("width"),
        height=params.get("height"),
        steps=params.get("steps"),
        cfg_scale=params.get("cfg_scale"),
        seed=params.get("seed"),
        created_at=job.created_at,
        finished_at=job.finished_at,
        generation_info=_coerce_generation_info(result_payload),
        rating=job.rating,
        is_favorite=bool(job.is_favorite),
        rating_updated_at=job.rating_updated_at,
        favorite_updated_at=job.favorite_updated_at,
    )
