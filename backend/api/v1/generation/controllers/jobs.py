"""Controllers for generation job endpoints."""

from __future__ import annotations

from typing import List

from fastapi import BackgroundTasks, HTTPException
from backend.schemas import (
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
    GenerationCancelResponse,
    GenerationJobStatus,
    SDNextGenerationParams,
)
from backend.services import ApplicationServices

from ..presenters.jobs import build_active_job

ACTIVE_JOB_STATUSES = frozenset({"pending", "running", "retrying"})
CANCELLABLE_STATUSES = frozenset({"pending", "running"})

__all__ = [
    "schedule_generation_job",
    "list_active_jobs",
    "get_job_wrapper",
    "cancel_job",
]


def _coerce_params(payload: object) -> dict:
    if isinstance(payload, dict):
        return payload
    return {}


async def schedule_generation_job(
    *,
    application: ApplicationServices,
    generation_params: SDNextGenerationParams,
    background_tasks: BackgroundTasks,
    backend: str,
    mode: str,
    save_images: bool,
    return_format: str,
) -> DeliveryCreateResponse:
    """Queue a generation job for background processing."""
    coordinator = application.generation_coordinator
    job = coordinator.schedule_generation_job(
        generation_params,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        background_tasks=background_tasks,
    )

    await coordinator.broadcast_job_started(job.id, generation_params)
    return DeliveryCreateResponse(delivery_id=job.id)


def list_active_jobs(
    *,
    application: ApplicationServices,
    limit: int,
) -> List[GenerationJobStatus]:
    """Return active generation jobs for frontend queues."""
    coordinator = application.generation_coordinator
    jobs = application.deliveries.list_jobs_by_statuses(
        statuses=ACTIVE_JOB_STATUSES,
        limit=limit,
    )
    return [build_active_job(job, coordinator) for job in jobs]


def get_job_wrapper(
    *,
    application: ApplicationServices,
    job_id: str,
) -> DeliveryWrapper:
    """Get generation job status and results."""
    job = application.deliveries.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    presenter = build_active_job(job, application.generation_coordinator)
    params = _coerce_params(application.deliveries.get_job_params(job))

    delivery_read = DeliveryRead(
        id=job.id,
        prompt=job.prompt,
        mode=job.mode,
        params=params,
        status=presenter.status,
        result=presenter.result,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )

    return DeliveryWrapper(delivery=delivery_read)


def cancel_job(
    *,
    application: ApplicationServices,
    job_id: str,
) -> GenerationCancelResponse:
    """Cancel an active generation job."""
    job = application.deliveries.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=400, detail="Job cannot be cancelled in its current state"
        )

    application.deliveries.update_job_status(
        job_id, "cancelled", result={"status": "cancelled"}
    )
    application.websocket.stop_job_monitoring(job_id)

    return GenerationCancelResponse(
        status="cancelled", message="Generation job cancelled"
    )
