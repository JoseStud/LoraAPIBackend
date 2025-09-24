"""System status API endpoints."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_application_services
from backend.services import ApplicationServices

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
async def get_system_status(
    services: ApplicationServices = Depends(get_application_services),
) -> Dict[str, Any]:
    """Return a snapshot of system status and telemetry data."""
    return await services.system.get_system_status_payload()
