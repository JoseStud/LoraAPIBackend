"""HTTP routes for generation job operations."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from backend.core.dependencies import get_application_services
from backend.schemas import (
    DeliveryCreateResponse,
    DeliveryWrapper,
    GenerationCancelResponse,
    GenerationJobStatus,
    SDNextGenerationParams,
)
from backend.services import ApplicationServices

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
    application: ApplicationServices = Depends(get_application_services),
):
    """Queue a generation job for background processing."""
    return await controller.schedule_generation_job(
        application=application,
        generation_params=generation_params,
        background_tasks=background_tasks,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
    )


@router.get("/jobs/active", response_model=List[GenerationJobStatus])
async def list_active_generation_jobs(
    limit: int = Query(50, ge=1, le=200),
    application: ApplicationServices = Depends(get_application_services),
):
    """Return active generation jobs for frontend queues."""
    return controller.list_active_jobs(application=application, limit=limit)


@router.get("/jobs/{job_id}", response_model=DeliveryWrapper)
async def get_generation_job(
    job_id: str,
    application: ApplicationServices = Depends(get_application_services),
):
    """Get generation job status and results."""
    return controller.get_job_wrapper(application=application, job_id=job_id)


@router.post("/jobs/{job_id}/cancel", response_model=GenerationCancelResponse)
async def cancel_generation_job(
    job_id: str,
    application: ApplicationServices = Depends(get_application_services),
):
    """Cancel an active generation job."""
    return controller.cancel_job(application=application, job_id=job_id)
