"""HTTP routes for generation job operations."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from backend.core.dependencies import get_services
from backend.schemas import (
    DeliveryCreateResponse,
    DeliveryWrapper,
    GenerationCancelResponse,
    GenerationJobStatus,
    SDNextGenerationParams,
)
from backend.services import ServiceRegistry

from .controllers import jobs as controller

router = APIRouter()


@router.post("/queue-generation", response_model=DeliveryCreateResponse)
async def queue_generation_job(
    generation_params: SDNextGenerationParams,
    background_tasks: BackgroundTasks,
    backend: str = "sdnext",
    mode: str = "deferred",
    save_images: bool = True,
    return_format: str = "base64",
    client_ref: Optional[str] = Query(
        None,
        max_length=200,
        description="Opaque caller tag echoed back in the job-finished webhook.",
    ),
    services: ServiceRegistry = Depends(get_services),
):
    """Queue a generation job for background processing."""
    return await controller.schedule_generation_job(
        services=services,
        generation_params=generation_params,
        background_tasks=background_tasks,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        client_ref=client_ref,
    )


@router.get("/jobs/active", response_model=List[GenerationJobStatus])
async def list_active_generation_jobs(
    limit: int = Query(50, ge=1, le=200),
    services: ServiceRegistry = Depends(get_services),
):
    """Return active generation jobs for frontend queues."""
    return controller.list_active_jobs(services=services, limit=limit)


@router.get("/jobs/{job_id}", response_model=DeliveryWrapper)
async def get_generation_job(
    job_id: str,
    services: ServiceRegistry = Depends(get_services),
):
    """Get generation job status and results."""
    return controller.get_job_wrapper(services=services, job_id=job_id)


@router.post("/jobs/{job_id}/cancel", response_model=GenerationCancelResponse)
async def cancel_generation_job(
    job_id: str,
    services: ServiceRegistry = Depends(get_services),
):
    """Cancel an active generation job."""
    return await controller.cancel_job(services=services, job_id=job_id)
