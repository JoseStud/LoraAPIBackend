"""Router for SDNext generation endpoints."""

import asyncio
import json
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from backend.core.database import get_session_context
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
    GenerationStarted,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import ServiceContainer

ACTIVE_JOB_STATUSES = {"pending", "running"}
CANCELLABLE_STATUSES = {"pending", "running"}

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
    services: ServiceContainer = Depends(get_service_container),
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
        print(f"Generation warnings: {warnings}")
    
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
        await services.websocket.start_job_monitoring(result.job_id, services.generation)
        
        # Broadcast generation started notification
        started_notification = GenerationStarted(
            job_id=result.job_id,
            params=generation_params,
        )
        await services.websocket.manager.broadcast_generation_started(
            result.job_id, 
            started_notification,
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
    return result


@router.post("/compose-and-generate", response_model=SDNextGenerationResult)
async def compose_and_generate(
    compose_request: ComposeRequest,
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    mode: str = "immediate",
    save_images: bool = True,
    return_format: str = "base64",
    services: ServiceContainer = Depends(get_service_container),
):
    """Compose LoRA prompt and immediately generate images.
    
    This endpoint combines the compose and generate operations for convenience.
    """
    # Step 1: Get active adapters and compose prompt
    active_adapters = services.adapters.list_active_ordered()
    
    if not active_adapters:
        raise HTTPException(status_code=400, detail="No active adapters found")
    
    # Validate adapters
    warnings = services.compose.validate_adapters(active_adapters)
    if warnings:
        print(f"Composition warnings: {warnings}")
    
    # Compose prompt
    full_prompt, tokens = services.compose.compose_prompt(
        active_adapters,
        compose_request.prefix or "",
        compose_request.suffix or "",
    )
    
    # Step 2: Generate with composed prompt
    # Update generation params with composed prompt
    generation_params.prompt = full_prompt
    
    # Validate generation parameters
    gen_warnings = await services.generation.validate_generation_params(generation_params)
    if gen_warnings:
        print(f"Generation warnings: {gen_warnings}")
    
    # Prepare parameters
    params = {
        "mode": mode,
        "save_images": save_images,
        "return_format": return_format,
    }
    
    result = await services.generation.generate_image(
        full_prompt,
        backend,
        generation_params,
        **params,
    )
    
    # Start WebSocket monitoring if job was created
    if result.job_id and mode == "deferred":
        await services.websocket.start_job_monitoring(result.job_id, services.generation)
        
        # Broadcast generation started notification
        started_notification = GenerationStarted(
            job_id=result.job_id,
            params=generation_params,
        )
        await services.websocket.manager.broadcast_generation_started(
            result.job_id, 
            started_notification,
        )
    
    return result


@router.post("/queue-generation", response_model=DeliveryCreateResponse)
async def queue_generation_job(
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    mode: str = "deferred",
    save_images: bool = True,
    return_format: str = "base64",
    background_tasks: BackgroundTasks = BackgroundTasks(),
    services: ServiceContainer = Depends(get_service_container),
):
    """Queue a generation job for background processing.
    
    This creates a delivery job that will be processed by a worker.
    """
    # Prepare delivery parameters
    delivery_params = {
        "generation_params": generation_params.model_dump(),
        "mode": mode,
        "save_images": save_images,
        "return_format": return_format,
        "backend": backend,
    }
    
    # Create delivery job
    job = services.deliveries.create_job(
        prompt=generation_params.prompt,
        mode="sdnext",
        params=delivery_params,
    )
    
    # Queue for background processing
    background_tasks.add_task(
        _process_generation_job,
        job.id,
        delivery_params,
    )
    
    # Start WebSocket monitoring for the job
    await services.websocket.start_job_monitoring(job.id, services.generation)
    
    # Broadcast generation started notification
    started_notification = GenerationStarted(
        job_id=job.id,
        params=generation_params,
    )
    await services.websocket.manager.broadcast_generation_started(
        job.id, 
        started_notification,
    )
    
    return DeliveryCreateResponse(delivery_id=job.id)


@router.get("/jobs/active", response_model=List[GenerationJobStatus])
async def list_active_generation_jobs(
    limit: int = Query(50, ge=1, le=200),
    services: ServiceContainer = Depends(get_service_container),
):
    """Return active generation jobs for frontend queues."""

    jobs_by_id = {}
    for status in ACTIVE_JOB_STATUSES:
        for job in services.deliveries.list_jobs(status=status, limit=limit):
            jobs_by_id[job.id] = job

    ordered_jobs = sorted(
        jobs_by_id.values(),
        key=lambda job: job.started_at or job.created_at,
        reverse=True,
    )

    active_jobs: List[GenerationJobStatus] = []
    for job in ordered_jobs[:limit]:
        raw_params = services.deliveries.get_job_params(job)
        generation_params: Dict[str, Any] = {}
        if isinstance(raw_params, dict):
            maybe_generation_params = raw_params.get("generation_params")
            if isinstance(maybe_generation_params, dict):
                generation_params = maybe_generation_params
            else:
                generation_params = raw_params

        result_payload = services.deliveries.get_job_result(job) or {}
        if not isinstance(result_payload, dict):
            result_payload = {}

        progress_value = result_payload.get("progress")
        progress = 0.0
        if isinstance(progress_value, (int, float)):
            progress = float(progress_value)
            if progress <= 1:
                progress *= 100

        message = None
        for key in ("message", "detail"):
            value = result_payload.get(key)
            if isinstance(value, str):
                message = value
                break

        error_text = None
        for key in ("error", "error_message"):
            value = result_payload.get(key)
            if isinstance(value, str):
                error_text = value
                break

        active_jobs.append(
            GenerationJobStatus(
                id=job.id,
                jobId=job.id,
                prompt=generation_params.get("prompt") or job.prompt,
                status=job.status,
                progress=progress,
                message=message,
                error=error_text,
                params=generation_params,
                created_at=job.created_at,
                startTime=job.started_at or job.created_at,
                finished_at=job.finished_at,
                result=result_payload or None,
            )
        )

    return active_jobs


@router.get("/jobs/{job_id}", response_model=DeliveryWrapper)
async def get_generation_job(
    job_id: str,
    services: ServiceContainer = Depends(get_service_container),
):
    """Get generation job status and results."""
    job = services.deliveries.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Convert to read model
    delivery_read = DeliveryRead(
        id=job.id,
        prompt=job.prompt,
        mode=job.mode,
        params=services.deliveries.get_job_params(job),
        status=job.status,
        result=services.deliveries.get_job_result(job),
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )

    return DeliveryWrapper(delivery=delivery_read)


@router.post("/jobs/{job_id}/cancel", response_model=GenerationCancelResponse)
async def cancel_generation_job(
    job_id: str,
    services: ServiceContainer = Depends(get_service_container),
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
    services: ServiceContainer = Depends(get_service_container),
):
    """Return recent completed generation results."""
    jobs = services.deliveries.list_jobs(status="succeeded", limit=limit, offset=offset)

    results: List[GenerationResultSummary] = []
    for job in jobs:
        raw_params = services.deliveries.get_job_params(job)
        generation_params: Dict[str, Any] = {}
        if isinstance(raw_params, dict):
            maybe_generation_params = raw_params.get("generation_params")
            if isinstance(maybe_generation_params, dict):
                generation_params = maybe_generation_params
            else:
                generation_params = raw_params

        result_payload = services.deliveries.get_job_result(job) or {}
        if not isinstance(result_payload, dict):
            result_payload = {}

        images = result_payload.get("images")
        image_url = None
        if isinstance(images, list) and images:
            first_image = images[0]
            if isinstance(first_image, str):
                image_url = first_image

        thumbnail_url = result_payload.get("thumbnail_url")
        if not isinstance(thumbnail_url, str):
            thumbnail_url = None

        generation_info = result_payload.get("generation_info")
        if isinstance(generation_info, str):
            try:
                generation_info = json.loads(generation_info)
            except (TypeError, json.JSONDecodeError):
                generation_info = None
        elif not isinstance(generation_info, dict):
            generation_info = None

        results.append(
            GenerationResultSummary(
                id=job.id,
                job_id=job.id,
                prompt=generation_params.get("prompt") or job.prompt,
                negative_prompt=generation_params.get("negative_prompt"),
                status=job.status,
                image_url=image_url,
                thumbnail_url=thumbnail_url,
                width=generation_params.get("width"),
                height=generation_params.get("height"),
                steps=generation_params.get("steps"),
                cfg_scale=generation_params.get("cfg_scale"),
                seed=generation_params.get("seed"),
                created_at=job.created_at,
                finished_at=job.finished_at,
                generation_info=generation_info,
            )
        )

    return results


def _process_generation_job(job_id: str, params: Dict) -> None:
    """Background task to process a generation job executed synchronously."""
    asyncio.run(_process_generation_job_async(job_id, params))


async def _process_generation_job_async(job_id: str, params: Dict) -> None:
    with get_session_context() as session:
        services = ServiceContainer(session)

        # Update job status to running
        services.deliveries.update_job_status(job_id, "running")

        try:
            # Extract parameters
            gen_params_dict = params.get("generation_params", {})
            gen_params = SDNextGenerationParams(**gen_params_dict)
            backend = params.get("backend", "sdnext")

            # Generate image
            generation_kwargs = {
                key: value
                for key, value in params.items()
                if key != "generation_params"
            }
            result = await services.generation.generate_image(
                gen_params.prompt,
                backend,
                gen_params,
                **generation_kwargs,
            )

            # Update job with result
            if result.status == "completed":
                services.deliveries.update_job_status(
                    job_id,
                    "succeeded",
                    result.model_dump(),
                )
            else:
                services.deliveries.update_job_status(
                    job_id,
                    "failed",
                    result.model_dump(),
                )

        except Exception as exc:  # pragma: no cover - background logging path
            # Update job with error
            services.deliveries.update_job_status(
                job_id,
                "failed",
                {"error": str(exc)},
            )
