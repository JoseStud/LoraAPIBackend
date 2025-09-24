"""HTTP routes for generation result operations."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query, Response

from backend.core.dependencies import (
    get_application_services,
    get_core_services,
)
from backend.schemas import (
    GenerationBulkDeleteRequest,
    GenerationResultSummary,
)
from backend.services import ApplicationServices, CoreServices

from .controllers import results as controller
from .presenters.streams import stream_download

router = APIRouter()


@router.get("/results", response_model=List[GenerationResultSummary])
async def list_generation_results(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    application: ApplicationServices = Depends(get_application_services),
):
    """Return recent completed generation results."""
    return controller.list_results(application=application, limit=limit, offset=offset)


@router.delete("/results/bulk-delete")
async def bulk_delete_generation_results(
    request: GenerationBulkDeleteRequest,
    application: ApplicationServices = Depends(get_application_services),
    core: CoreServices = Depends(get_core_services),
):
    """Delete multiple generation results in a single request."""
    target_ids = [str(identifier) for identifier in request.ids]
    deleted = controller.bulk_delete_results(
        application=application,
        core=core,
        target_ids=target_ids,
    )
    return {"deleted": deleted}


@router.delete("/results/{result_id}", status_code=204)
async def delete_generation_result(
    result_id: str,
    application: ApplicationServices = Depends(get_application_services),
    core: CoreServices = Depends(get_core_services),
):
    """Delete a stored generation result and its associated artifacts."""
    controller.delete_result(
        application=application,
        core=core,
        result_id=str(result_id),
    )
    return Response(status_code=204)


@router.get("/results/{result_id}/download")
async def download_generation_result(
    result_id: str,
    application: ApplicationServices = Depends(get_application_services),
    core: CoreServices = Depends(get_core_services),
):
    """Download the primary asset associated with a generation result."""
    payload = controller.prepare_result_download(
        application=application,
        core=core,
        result_id=str(result_id),
    )
    return stream_download(payload)
