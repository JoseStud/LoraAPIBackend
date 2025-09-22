"""Compose endpoint: build prompts from adapters and optionally create a delivery job.

This module exposes a single POST /compose endpoint that builds a prompt
from active adapters and optionally schedules a delivery.
"""

import structlog

from fastapi import APIRouter, BackgroundTasks, Depends

from backend.core.dependencies import get_service_container
from backend.schemas import ComposeRequest, ComposeResponse
from backend.services import ServiceContainer

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/compose", response_model=ComposeResponse)
async def compose(
    req: ComposeRequest,
    background_tasks: BackgroundTasks,
    services: ServiceContainer = Depends(get_service_container),
):
    """Compose a prompt from active adapters and optionally schedule delivery."""
    # Compose prompt and collect warnings via the shared helper
    composition = services.compose.compose_from_adapter_service(
        services.adapters,
        prefix=req.prefix or "",
        suffix=req.suffix or "",
    )

    if composition.warnings:
        # Log warnings but continue
        logger.warning("composition warnings", warnings=composition.warnings)

    delivery_info = None
    if req.delivery:
        job = services.deliveries.schedule_job(
            composition.prompt,
            req.delivery.mode,
            req.delivery.model_dump(),
            background_tasks=background_tasks,
        )
        delivery_info = {"id": job.id, "status": job.status}

    return ComposeResponse(
        prompt=composition.prompt,
        tokens=composition.tokens,
        delivery=delivery_info,
    )
