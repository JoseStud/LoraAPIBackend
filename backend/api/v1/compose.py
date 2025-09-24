"""Compose endpoint: build prompts from adapters and optionally create a delivery job.

This module exposes a single POST /compose endpoint that builds a prompt
from active adapters and optionally schedules a delivery.
"""

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends

from backend.core.dependencies import get_application_services, get_domain_services
from backend.schemas import ComposeRequest, ComposeResponse
from backend.schemas.generation import SDNextGenerationParams
from backend.services import ApplicationServices, DomainServices

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/compose", response_model=ComposeResponse)
async def compose(
    req: ComposeRequest,
    background_tasks: BackgroundTasks,
    domain: DomainServices = Depends(get_domain_services),
    application: ApplicationServices = Depends(get_application_services),
):
    """Compose a prompt from active adapters and optionally schedule delivery."""
    # Compose prompt and collect warnings via the shared helper
    composition = domain.compose.compose_from_adapter_service(
        domain.adapters,
        prefix=req.prefix or "",
        suffix=req.suffix or "",
    )

    if composition.warnings:
        # Log warnings but continue
        logger.warning("composition warnings", warnings=composition.warnings)

    delivery_info = None
    if req.delivery:
        sdnext_config = req.delivery.sdnext
        if sdnext_config is not None:
            generation_params: SDNextGenerationParams = (
                sdnext_config.generation_params.model_copy()
            )
            generation_params.prompt = composition.prompt
            job = application.generation_coordinator.schedule_generation_job(
                generation_params,
                backend=req.delivery.mode,
                mode=sdnext_config.mode,
                save_images=sdnext_config.save_images,
                return_format=sdnext_config.return_format,
                background_tasks=background_tasks,
            )
            await application.generation_coordinator.broadcast_job_started(
                job.id,
                generation_params,
            )
        else:
            job = application.deliveries.schedule_job(
                composition.prompt,
                req.delivery.mode,
                req.delivery.model_dump(),
                background_tasks=background_tasks,
            )

        delivery_info = {"id": job.id, "status": job.status}

    return ComposeResponse(
        prompt=composition.prompt,
        tokens=composition.tokens,
        warnings=composition.warnings,
        delivery=delivery_info,
    )
