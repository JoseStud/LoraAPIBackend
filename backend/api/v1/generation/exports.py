"""HTTP routes for generation export operations."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.core.dependencies import (
    get_application_services,
    get_core_services,
)
from backend.schemas import GenerationExportRequest
from backend.services import ApplicationServices, CoreServices

from .controllers import results as results_controller
from .presenters.streams import stream_archive

router = APIRouter()


@router.post("/results/export")
async def export_generation_results(
    request: GenerationExportRequest,
    application: ApplicationServices = Depends(get_application_services),
    core: CoreServices = Depends(get_core_services),
):
    """Stream a ZIP archive containing the requested generation results."""
    target_ids = [str(identifier) for identifier in request.ids]
    archive = results_controller.prepare_results_archive(
        application=application,
        core=core,
        target_ids=target_ids,
        include_metadata=request.include_metadata,
    )
    return stream_archive(archive)
