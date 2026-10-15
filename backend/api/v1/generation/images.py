"""Serve stored generation result images to the browser.

This router is mounted without the API key dependency, like the dashboard,
system and progress WebSocket routes: ``<img>`` tags cannot send the
``X-API-Key`` header, and the key is not an access control (README, "Security
model"). It only ever serves files inside the generation output directory.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.core.dependencies import get_services
from backend.services import ServiceRegistry
from backend.utils.images import resolve_output_dir

router = APIRouter(prefix="/generation", tags=["generation"])

_CACHE_CONTROL = "private, max-age=86400"


@router.get(
    "/results/{job_id}/images/{index}",
    response_class=FileResponse,
    responses={
        200: {"content": {"image/png": {}}, "description": "The image file."},
        404: {"description": "No such job, image or file."},
    },
)
async def get_result_image(
    job_id: str,
    index: int,
    services: ServiceRegistry = Depends(get_services),
) -> FileResponse:
    """Return image ``index`` of a generation result as a file."""
    job = services.deliveries.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Image not found")

    asset = services.deliveries.result_manager.resolve_image_asset(
        job,
        index,
        services.storage,
        coordinator=services.generation_coordinator,
    )
    if asset is None or not asset.path:
        raise HTTPException(status_code=404, detail="Image not found")

    if not services.storage.validate_file_path(asset.path, root=resolve_output_dir()):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(
        os.path.realpath(asset.path),
        media_type=asset.content_type,
        headers={"Cache-Control": _CACHE_CONTROL},
    )


__all__ = ["router"]
