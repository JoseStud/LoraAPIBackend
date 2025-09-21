"""Dashboard API endpoints for frontend statistics and system health."""

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_service_container
from backend.services import ServiceContainer

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(services: ServiceContainer = Depends(get_service_container)):
    """Get dashboard statistics and system health information."""

    stats = services.adapters.get_dashboard_statistics()
    stats["active_jobs"] = services.deliveries.count_active_jobs()

    system_health = services.system.get_health_summary().as_dict()

    return {
        "stats": stats,
        "system_health": system_health,
    }


@router.get("/featured-loras")
async def get_featured_loras(services: ServiceContainer = Depends(get_service_container)):
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
async def get_activity_feed(services: ServiceContainer = Depends(get_service_container)):
    """Get recent activity feed for the dashboard."""

    return services.deliveries.get_recent_activity(limit=10)
