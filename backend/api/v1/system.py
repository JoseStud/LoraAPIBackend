"""System status API endpoints."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_service_container
from backend.services import ServiceContainer


router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
async def get_system_status(services: ServiceContainer = Depends(get_service_container)) -> Dict[str, Any]:
    """Return a snapshot of system status and telemetry data."""

    return services.system.get_system_status_payload()

