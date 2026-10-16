"""Presentation helpers for generation jobs."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.models import DeliveryJob
from backend.schemas import (
    DeliveryJobResult,
    GenerationJobStatus,
    SDNextGenerationResult,
)
from backend.services.generation import (
    GenerationCoordinator,
    SerializedGenerationJob,
    normalize_generation_status,
)
from backend.utils.images import to_browser_image_src

__all__ = ["build_active_job", "build_generation_result"]

CANCELLED_MESSAGE = "Generation job was cancelled"


def _browser_images(job_id: str, images: List[str]) -> List[str]:
    """Return ``images`` as browser-loadable sources, dropping the rest."""
    sources = (
        to_browser_image_src(image, job_id=job_id, index=index)
        for index, image in enumerate(images)
    )
    return [src for src in sources if src]


def _with_browser_images(job_id: str, result: DeliveryJobResult) -> Dict[str, Any]:
    """Return the stored result with ``images`` turned into browser-loadable sources.

    Stored file references become the result image route and legacy base64
    becomes a data URI. Entries with no loadable source are dropped rather
    than exposing internal values.
    """
    payload = result.to_payload()
    if result.images is None:
        return payload
    return {**payload, "images": _browser_images(job_id, result.images)}


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


def build_generation_result(
    job: DeliveryJob,
    serialized: SerializedGenerationJob,
    *,
    live_progress: Optional[float] = None,
) -> SDNextGenerationResult:
    """Return a generation job's stored state as an ``SDNextGenerationResult``.

    ``job_id`` is the delivery job id, ``status`` the UI vocabulary
    (``queued``/``processing``/``completed``/``failed``; a cancelled job is
    ``failed``) and ``progress`` the same fraction as the REST queue
    (:class:`GenerationJobStatus`), 1.0 once completed. ``live_progress``,
    SD.Next's progress for the job it is rendering, is used only while
    nothing is stored. Images are browser-loadable sources, never raw image
    data from the row.
    """
    result = serialized.result
    status = normalize_generation_status(job.status)

    progress = serialized.progress
    if result.progress is None and live_progress is not None and status != "completed":
        progress = live_progress

    error_message = result.failure_message
    if error_message is None and job.status == "cancelled":
        error_message = CANCELLED_MESSAGE

    images = _browser_images(job.id, result.images or [])

    return SDNextGenerationResult(
        job_id=job.id,
        status=status,
        images=images or None,
        progress=progress,
        error_message=error_message,
        generation_info=result.generation_info or None,
    )
