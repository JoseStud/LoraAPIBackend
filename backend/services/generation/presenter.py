"""Presenter helpers for generation delivery jobs."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from backend.models import DeliveryJob
from backend.schemas import GenerationJobStatus, GenerationResultSummary

from . import GenerationCoordinator, normalize_generation_status


def _extract_image_url(result_payload: Dict[str, Any]) -> Optional[str]:
    images = result_payload.get("images")
    if isinstance(images, list) and images:
        first_image = images[0]
        if isinstance(first_image, str):
            return first_image
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


def build_active_job(
    job: DeliveryJob, coordinator: GenerationCoordinator,
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


def build_result(
    job: DeliveryJob, coordinator: GenerationCoordinator,
) -> GenerationResultSummary:
    """Return an API-facing representation of a completed generation job."""
    serialized = coordinator.serialize_delivery_job(job)
    params = serialized.get("params") or {}
    result_payload = serialized.get("result") or {}

    thumbnail_url = result_payload.get("thumbnail_url")
    if not isinstance(thumbnail_url, str):
        thumbnail_url = None

    return GenerationResultSummary(
        id=job.id,
        job_id=job.id,
        prompt=params.get("prompt") or job.prompt,
        negative_prompt=params.get("negative_prompt"),
        status=normalize_generation_status(job.status),
        image_url=_extract_image_url(result_payload),
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
