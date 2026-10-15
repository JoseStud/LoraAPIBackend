"""HTTP routes for generation export operations."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_services
from backend.schemas import GenerationExportRequest
from backend.services import ServiceRegistry

from .controllers import results as results_controller
from .presenters.streams import stream_archive

router = APIRouter()


@router.post("/results/export")
async def export_generation_results(
    request: GenerationExportRequest,
    services: ServiceRegistry = Depends(get_services),
):
    """Stream a ZIP archive containing the requested generation results."""
    target_ids = [str(identifier) for identifier in request.ids]
    archive = results_controller.prepare_results_archive(
        services=services,
        target_ids=target_ids,
        include_metadata=request.include_metadata,
    )
    return stream_archive(archive)
