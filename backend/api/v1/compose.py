"""Compose endpoint: build prompts from adapters and optionally create a delivery job.

This module exposes a single POST /compose endpoint that builds a prompt
from active adapters and optionally schedules a delivery.
"""

from fastapi import APIRouter, BackgroundTasks, Depends

from backend.core.dependencies import get_service_container
from backend.schemas import ComposeRequest, ComposeResponse
from backend.services import ServiceContainer

router = APIRouter()


@router.post("/compose", response_model=ComposeResponse)
async def compose(
    req: ComposeRequest,
    background_tasks: BackgroundTasks,
    services: ServiceContainer = Depends(get_service_container),
):
    """Compose a prompt from active adapters and optionally schedule delivery."""
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
        job = services.deliveries.schedule_job(
            prompt,
            req.delivery.mode,
            req.delivery.model_dump(),
            background_tasks=background_tasks,
        )
        delivery_info = {"id": job.id, "status": job.status}

    return ComposeResponse(prompt=prompt, tokens=tokens, delivery=delivery_info)
