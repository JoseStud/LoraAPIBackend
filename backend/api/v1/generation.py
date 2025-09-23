"""Router for SDNext generation endpoints."""

import json
from typing import Dict, List

import structlog

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from backend.core.dependencies import get_service_container
from backend.delivery import get_generation_backend
from backend.schemas import (
    ComposeRequest,
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
    GenerationCancelResponse,
    GenerationJobStatus,
    GenerationResultSummary,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import ServiceRegistry
from backend.services.generation import normalize_generation_status
from backend.services.generation.presenter import build_active_job, build_result

ACTIVE_JOB_STATUSES = {"pending", "running"}
CANCELLABLE_STATUSES = {"pending", "running"}

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/generation", tags=["generation"])


@router.get("/backends", response_model=Dict[str, bool])
async def list_generation_backends():
    """List available generation backends and their status."""
    from backend.delivery.base import delivery_registry
    backends_info = delivery_registry.list_available_backends()
    return backends_info.get("generation", {})


@router.post("/generate", response_model=SDNextGenerationResult)
async def generate_image(
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    mode: str = "immediate",
    save_images: bool = True,
    return_format: str = "base64",
    services: ServiceRegistry = Depends(get_service_container),
):
    """Generate an image using the specified backend.
    
    Args:
        generation_params: Generation parameters
        backend: Generation backend name
        mode: Generation mode ("immediate" or "deferred")
        save_images: Whether to save generated images
        return_format: Return format ("base64", "file_path", "url")

    """
    # Validate parameters
    warnings = await services.generation.validate_generation_params(generation_params)
    if warnings:
        # For now, just log warnings but continue
        logger.warning(
            "generation parameter validation warnings",
            warnings=warnings,
            backend=backend,
            mode=mode,
        )
    
    # Prepare parameters
    params = {
        "mode": mode,
        "save_images": save_images,
        "return_format": return_format,
    }
    
    result = await services.generation.generate_image(
        generation_params.prompt,
        backend,
        generation_params,
        **params,
    )
    
    # Start WebSocket monitoring if job was created
    if result.job_id and mode == "deferred":
        await services.generation_coordinator.broadcast_job_started(
            result.job_id,
            generation_params,
        )
    
    return result


@router.get("/progress/{job_id}", response_model=SDNextGenerationResult)
async def check_generation_progress(
    job_id: str,
    backend: str = "sdnext",
):
    """Check the progress of a generation job."""
    try:
        generation_backend = get_generation_backend(backend)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Backend '{backend}' not found")
    
    result = await generation_backend.check_progress(job_id)
    normalized_status = normalize_generation_status(result.status)
    if normalized_status != result.status:
        result = result.model_copy(update={"status": normalized_status})
    return result


@router.post("/compose-and-generate", response_model=SDNextGenerationResult)
async def compose_and_generate(
    compose_request: ComposeRequest,
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    mode: str = "immediate",
    save_images: bool = True,
    return_format: str = "base64",
    services: ServiceRegistry = Depends(get_service_container),
):
    """Compose LoRA prompt and immediately generate images.
    
    This endpoint combines the compose and generate operations for convenience.
    """
    # Step 1: Compose prompt via shared helper
    composition = services.compose.compose_from_adapter_service(
        services.adapters,
        prefix=compose_request.prefix or "",
        suffix=compose_request.suffix or "",
    )

    if not composition.tokens:
        raise HTTPException(status_code=400, detail="No active adapters found")

    if composition.warnings:
        logger.warning(
            "composition warnings during compose-and-generate",
            warnings=composition.warnings,
            backend=backend,
            mode=mode,
        )

    # Step 2: Generate with composed prompt
    # Update generation params with composed prompt
    generation_params.prompt = composition.prompt
    
    # Validate generation parameters
    gen_warnings = await services.generation.validate_generation_params(generation_params)
    if gen_warnings:
        logger.warning(
            "generation parameter validation warnings",
            warnings=gen_warnings,
            backend=backend,
            mode=mode,
        )
    
    # Prepare parameters
    params = {
        "mode": mode,
        "save_images": save_images,
        "return_format": return_format,
    }
    
    result = await services.generation.generate_image(
        composition.prompt,
        backend,
        generation_params,
        **params,
    )
    
    # Start WebSocket monitoring if job was created
    if result.job_id and mode == "deferred":
        await services.generation_coordinator.broadcast_job_started(
            result.job_id,
            generation_params,
        )
    
    return result


@router.post("/queue-generation", response_model=DeliveryCreateResponse)
async def queue_generation_job(
    generation_params: SDNextGenerationParams,
    background_tasks: BackgroundTasks,
    backend: str = "sdnext",
    mode: str = "deferred",
    save_images: bool = True,
    return_format: str = "base64",
    services: ServiceRegistry = Depends(get_service_container),
):
    """Queue a generation job for background processing.
    
    This creates a delivery job that will be processed by a worker.
    """
    coordinator = services.generation_coordinator

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


@router.get("/jobs/active", response_model=List[GenerationJobStatus])
async def list_active_generation_jobs(
    limit: int = Query(50, ge=1, le=200),
    services: ServiceRegistry = Depends(get_service_container),
):
    """Return active generation jobs for frontend queues."""

    coordinator = services.generation_coordinator
    jobs_by_id = {}
    for status in ACTIVE_JOB_STATUSES:
        for job in services.deliveries.list_jobs(status=status, limit=limit):
            jobs_by_id[job.id] = job

    ordered_jobs = sorted(
        jobs_by_id.values(),
        key=lambda job: job.started_at or job.created_at,
        reverse=True,
    )

    return [
        build_active_job(job, coordinator)
        for job in ordered_jobs[:limit]
    ]


@router.get("/jobs/{job_id}", response_model=DeliveryWrapper)
async def get_generation_job(
    job_id: str,
    services: ServiceRegistry = Depends(get_service_container),
):
    """Get generation job status and results."""
    job = services.deliveries.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    presenter = build_active_job(job, services.generation_coordinator)

    params = services.deliveries.get_job_params(job)
    if not isinstance(params, dict):
        params = {}

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


@router.post("/jobs/{job_id}/cancel", response_model=GenerationCancelResponse)
async def cancel_generation_job(
    job_id: str,
    services: ServiceRegistry = Depends(get_service_container),
):
    """Cancel an active generation job."""
    job = services.deliveries.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in CANCELLABLE_STATUSES:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled in its current state")

    services.deliveries.update_job_status(job_id, "cancelled", result={"status": "cancelled"})
    services.websocket.stop_job_monitoring(job_id)

    return GenerationCancelResponse(status="cancelled", message="Generation job cancelled")


@router.get("/results", response_model=List[GenerationResultSummary])
async def list_generation_results(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    services: ServiceRegistry = Depends(get_service_container),
):
    """Return recent completed generation results."""
    jobs = services.deliveries.list_jobs(status="succeeded", limit=limit, offset=offset)

    coordinator = services.generation_coordinator
    return [build_result(job, coordinator) for job in jobs]
