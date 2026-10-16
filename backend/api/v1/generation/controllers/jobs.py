"""Controllers for generation job endpoints."""

from __future__ import annotations

from typing import List, Optional

from fastapi import BackgroundTasks, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.schemas import (
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
    GenerationCancelResponse,
    GenerationJobStatus,
    SDNextGenerationParams,
)
from backend.services import ServiceRegistry

from ..presenters.jobs import build_active_job

ACTIVE_JOB_STATUSES = frozenset({"pending", "running", "retrying"})

__all__ = [
    "schedule_generation_job",
    "list_active_jobs",
    "get_job_wrapper",
    "cancel_job",
]


async def schedule_generation_job(
    *,
    services: ServiceRegistry,
    generation_params: SDNextGenerationParams,
    background_tasks: BackgroundTasks,
    backend: str,
    mode: str,
    save_images: bool,
    return_format: str,
    client_ref: Optional[str] = None,
) -> DeliveryCreateResponse:
    """Queue a generation job for background processing.

    Progress reaches WebSocket clients through the lifespan's job monitor.
    """
    job = await run_in_threadpool(
        services.generation_coordinator.schedule_generation_job,
        generation_params,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        background_tasks=background_tasks,
        client_ref=client_ref,
    )
    return DeliveryCreateResponse(delivery_id=job.id)


def list_active_jobs(
    *,
    services: ServiceRegistry,
    limit: int,
) -> List[GenerationJobStatus]:
    """Return active generation jobs for frontend queues."""
    coordinator = services.generation_coordinator
    jobs = services.deliveries.list_jobs_by_statuses(
        statuses=ACTIVE_JOB_STATUSES,
        limit=limit,
    )
    return [build_active_job(job, coordinator) for job in jobs]


def get_job_wrapper(
    *,
    services: ServiceRegistry,
    job_id: str,
) -> DeliveryWrapper:
    """Get generation job status and results."""
    job = services.deliveries.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    presenter = build_active_job(job, services.generation_coordinator)
    params = services.deliveries.get_job_params(job).to_payload()

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


async def cancel_job(
    *,
    services: ServiceRegistry,
    job_id: str,
) -> GenerationCancelResponse:
    """Cancel an active generation job."""
    if await run_in_threadpool(services.deliveries.get_job, job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if not await services.generation_coordinator.cancel_job(job_id):
        raise HTTPException(
            status_code=400, detail="Job cannot be cancelled in its current state"
        )

    return GenerationCancelResponse(
        status="cancelled", message="Generation job cancelled"
    )
