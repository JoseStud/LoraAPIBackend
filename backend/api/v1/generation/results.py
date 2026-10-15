"""HTTP routes for generation result operations."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query, Response

from backend.core.dependencies import get_services
from backend.schemas import (
    GenerationBulkDeleteRequest,
    GenerationResultSummary,
)
from backend.services import ServiceRegistry

from .controllers import results as controller
from .presenters.streams import stream_download

router = APIRouter()


@router.get("/results", response_model=List[GenerationResultSummary])
async def list_generation_results(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    services: ServiceRegistry = Depends(get_services),
):
    """Return recent completed generation results."""
    return controller.list_results(services=services, limit=limit, offset=offset)


@router.get("/results/stats")
async def get_generation_result_stats(
    services: ServiceRegistry = Depends(get_services),
):
    """Return totals for finished results (count, average rating, favourites)."""
    return services.deliveries.get_result_statistics()


@router.delete("/results/bulk-delete")
async def bulk_delete_generation_results(
    request: GenerationBulkDeleteRequest,
    services: ServiceRegistry = Depends(get_services),
):
    """Delete multiple generation results in a single request."""
    target_ids = [str(identifier) for identifier in request.ids]
    deleted = controller.bulk_delete_results(
        services=services,
        target_ids=target_ids,
    )
    return {"deleted": deleted}


@router.delete("/results/{result_id}", status_code=204)
async def delete_generation_result(
    result_id: str,
    services: ServiceRegistry = Depends(get_services),
):
    """Delete a stored generation result and its associated artifacts."""
    controller.delete_result(
        services=services,
        result_id=str(result_id),
    )
    return Response(status_code=204)


@router.get("/results/{result_id}/download")
async def download_generation_result(
    result_id: str,
    services: ServiceRegistry = Depends(get_services),
):
    """Download the primary asset associated with a generation result."""
    payload = controller.prepare_result_download(
        services=services,
        result_id=str(result_id),
    )
    return stream_download(payload)
