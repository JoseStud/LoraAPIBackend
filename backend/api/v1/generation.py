"""Router for SDNext generation endpoints."""

from typing import Dict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session

from backend.core.database import get_session, get_session_context
from backend.delivery import get_generation_backend
from backend.schemas import (
    ComposeRequest,
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
    GenerationStarted,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import create_service_container

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
    session: Session = Depends(get_session),
):
    """Generate an image using the specified backend.
    
    Args:
        generation_params: Generation parameters
        backend: Generation backend name
        mode: Generation mode ("immediate" or "deferred")
        save_images: Whether to save generated images
        return_format: Return format ("base64", "file_path", "url")
        session: Database session

    """
    services = create_service_container(session)
    
    # Validate parameters
    warnings = await services.generation.validate_generation_params(generation_params)
    if warnings:
        # For now, just log warnings but continue
        print(f"Generation warnings: {warnings}")
    
    # Prepare parameters
    params = {
        "generation_params": generation_params.model_dump(),
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
    session: Session = Depends(get_session),
):
    """Compose LoRA prompt and immediately generate images.
    
    This endpoint combines the compose and generate operations for convenience.
    """
    services = create_service_container(session)
    
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
        "generation_params": generation_params.model_dump(),
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
    session: Session = Depends(get_session),
):
    """Queue a generation job for background processing.
    
    This creates a delivery job that will be processed by a worker.
    """
    services = create_service_container(session)
    
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


@router.get("/jobs/{job_id}", response_model=DeliveryWrapper)
async def get_generation_job(
    job_id: str,
    session: Session = Depends(get_session),
):
    """Get generation job status and results."""
    services = create_service_container(session)
    
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


async def _process_generation_job(job_id: str, params: Dict):
    """Background task to process a generation job.
    
    Args:
        job_id: Delivery job ID
        params: Generation parameters

    """
    with get_session_context() as session:
        services = create_service_container(session)
        
        # Update job status to running
        services.deliveries.update_job_status(job_id, "running")
        
        try:
            # Extract parameters
            gen_params_dict = params.get("generation_params", {})
            gen_params = SDNextGenerationParams(**gen_params_dict)
            backend = params.get("backend", "sdnext")
            
            # Generate image
            result = await services.generation.generate_image(
                gen_params.prompt,
                backend,
                gen_params,
                **params,
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
                
        except Exception as exc:
            # Update job with error
            services.deliveries.update_job_status(
                job_id, 
                "failed", 
                {"error": str(exc)},
            )
