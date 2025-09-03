"""Compose endpoint: build prompts from adapters and optionally create a delivery job.

This module exposes a single POST /compose endpoint that builds a prompt
from active adapters and optionally schedules a delivery.
"""

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.delivery import get_delivery_backend, get_generation_backend
from backend.schemas import ComposeRequest, ComposeResponse, SDNextGenerationParams
from backend.services import create_service_container

router = APIRouter()


@router.post("/compose", response_model=ComposeResponse)
async def compose(
    req: ComposeRequest, 
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Compose a prompt from active adapters and optionally schedule delivery."""
    services = create_service_container(session)
    
    # Get active adapters
    adapters = services.adapters.list_active_ordered()
    
    # Validate adapters
    warnings = services.compose.validate_adapters(adapters)
    if warnings:
        # Log warnings but continue
        print(f"Composition warnings: {warnings}")
    
    # Compose prompt
    prompt, tokens = services.compose.compose_prompt(
        adapters,
        req.prefix or "",
        req.suffix or "",
    )

    delivery_info = None
    if req.delivery:
        # Create delivery job
        dj = services.deliveries.create_job(
            prompt, 
            req.delivery.mode, 
            req.delivery.model_dump(),
        )
        delivery_info = {"id": dj.id, "status": dj.status}
        
        # Schedule delivery based on mode
        if req.delivery.mode == "http" and req.delivery.http:
            background_tasks.add_task(
                _deliver_http, 
                prompt, 
                req.delivery.http.model_dump(),
                dj.id,
            )
        elif req.delivery.mode == "cli" and req.delivery.cli:
            background_tasks.add_task(
                _deliver_cli, 
                prompt, 
                req.delivery.cli.model_dump(),
                dj.id,
            )
        elif req.delivery.mode == "sdnext" and req.delivery.sdnext:
            background_tasks.add_task(
                _deliver_sdnext,
                prompt,
                req.delivery.sdnext.model_dump(),
                dj.id,
            )

    return ComposeResponse(prompt=prompt, tokens=tokens, delivery=delivery_info)


async def _deliver_http(prompt: str, params: dict, job_id: str):
    """Background task for HTTP delivery."""
    from backend.core.database import get_session
    
    try:
        backend = get_delivery_backend("http")
        result = await backend.deliver(prompt, params)
        
        # Update job status
        with get_session() as session:
            services = create_service_container(session)
            if result.get("status") in (200, "ok"):
                services.deliveries.update_job_status(job_id, "succeeded", result)
            else:
                services.deliveries.update_job_status(job_id, "failed", result)
    except Exception as exc:
        with get_session() as session:
            services = create_service_container(session)
            services.deliveries.update_job_status(
                job_id, 
                "failed", 
                {"error": str(exc)},
            )


async def _deliver_cli(prompt: str, params: dict, job_id: str):
    """Background task for CLI delivery."""
    from backend.core.database import get_session
    
    try:
        backend = get_delivery_backend("cli")
        result = await backend.deliver(prompt, params)
        
        # Update job status
        with get_session() as session:
            services = create_service_container(session)
            if result.get("status") == "ok":
                services.deliveries.update_job_status(job_id, "succeeded", result)
            else:
                services.deliveries.update_job_status(job_id, "failed", result)
    except Exception as exc:
        with get_session() as session:
            services = create_service_container(session)
            services.deliveries.update_job_status(
                job_id, 
                "failed", 
                {"error": str(exc)},
            )


async def _deliver_sdnext(prompt: str, params: dict, job_id: str):
    """Background task for SDNext generation delivery."""
    from backend.core.database import get_session
    
    try:
        backend = get_generation_backend("sdnext")
        
        # Extract generation parameters
        gen_params_dict = params.get("generation_params", {})
        gen_params_dict["prompt"] = prompt  # Use composed prompt
        
        # Convert to proper format
        gen_params = SDNextGenerationParams(**gen_params_dict)
        
        # Prepare full parameters
        full_params = {
            "generation_params": gen_params.model_dump(),
            "mode": params.get("mode", "immediate"),
            "save_images": params.get("save_images", True),
            "return_format": params.get("return_format", "base64"),
        }
        
        result = await backend.generate_image(prompt, full_params)
        
        # Update job status
        with get_session() as session:
            services = create_service_container(session)
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
        with get_session() as session:
            services = create_service_container(session)
            services.deliveries.update_job_status(
                job_id, 
                "failed", 
                {"error": str(exc)},
            )
