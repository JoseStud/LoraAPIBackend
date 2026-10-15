"""Dashboard API endpoints for frontend statistics and system health."""

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from backend.core.dependencies import get_services
from backend.services import ServiceRegistry

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _database_size_bytes() -> Optional[int]:
    """Return the SQLite database file size, or None for other databases."""
    from backend.core.database import ENGINE

    url = ENGINE.url
    if url.get_backend_name() != "sqlite" or not url.database:
        return None
    if url.database == ":memory:":
        return None
    try:
        return os.path.getsize(url.database)
    except OSError:
        return None


def _collect_stats(services: ServiceRegistry) -> Dict[str, Any]:
    stats = services.adapters.get_dashboard_statistics()
    stats["active_jobs"] = services.deliveries.count_active_jobs()
    stats["database_size"] = _database_size_bytes()
    return stats


@router.get("/stats")
async def get_dashboard_stats(
    services: ServiceRegistry = Depends(get_services),
):
    """Get dashboard statistics and system health information."""
    stats = await run_in_threadpool(_collect_stats, services)

    status_payload = await services.system.get_system_status_payload()
    # jobs currently being processed; the queue doesn't report a worker pool size
    stats["active_workers"] = status_payload.get("active_workers")
    system_health = (await services.system.get_health_summary(status_payload)).as_dict()

    return {
        "stats": stats,
        "system_health": system_health,
        # Live CPU, RAM, disk and GPU readings (sizes in MiB).
        "metrics": status_payload.get("metrics"),
    }


@router.get("/featured-loras")
def get_featured_loras(services: ServiceRegistry = Depends(get_services)):
    """Get featured LoRAs for the dashboard."""
    featured_loras = services.adapters.get_featured_adapters(limit=5)

    return [
        {
            "id": lora.id,
            "name": lora.name,
            "version": lora.version,
            "tags": lora.tags or [],
            "active": lora.active,
            "civitai_url": None,
            "description": lora.description,
        }
        for lora in featured_loras
    ]


@router.get("/activity-feed")
def get_activity_feed(
    services: ServiceRegistry = Depends(get_services),
):
    """Get recent activity feed for the dashboard."""
    return services.deliveries.get_recent_activity(limit=10)
