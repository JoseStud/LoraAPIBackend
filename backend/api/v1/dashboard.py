"""
Dashboard API endpoints for frontend statistics and system health.
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from backend.core.database import get_session
from backend.models.adapters import Adapter
from backend.services import ServiceContainer

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
async def get_dashboard_stats(session: Session = Depends(get_session)):
    """Get dashboard statistics and system health information."""
    
    # LoRA Statistics
    total_loras_result = session.exec(select(func.count(Adapter.id))).first()
    total_loras = total_loras_result or 0
    
    active_loras_result = session.exec(
        select(func.count(Adapter.id)).where(Adapter.active == True)
    ).first()
    active_loras = active_loras_result or 0
    
    # Embeddings coverage (mock for now - would calculate from actual embeddings)
    embeddings_coverage = min(100, (total_loras * 85) // max(1, total_loras)) if total_loras > 0 else 0
    
    # Recent imports (last 24 hours - simplified)
    recent_imports = 0  # Would implement with actual timestamp tracking
    
    # System health (mock data - would implement actual monitoring)
    system_health = {
        "status": "healthy",
        "gpu_status": "GPU Available",
        "gpu_memory": "8.2 GB / 24 GB",
        "queue_status": "active",
        "storage_usage": "45.2 GB / 500 GB"
    }
    
    return {
        "stats": {
            "total_loras": total_loras,
            "active_loras": active_loras,
            "embeddings_coverage": embeddings_coverage,
            "recent_imports": recent_imports
        },
        "system_health": system_health
    }

@router.get("/featured-loras")
async def get_featured_loras(session: Session = Depends(get_session)):
    """Get featured LoRAs for the dashboard."""
    
    # Get top 5 most recently active LoRAs
    featured_loras = session.exec(
        select(Adapter)
        .where(Adapter.active == True)
        .order_by(Adapter.id.desc())
        .limit(5)
    ).all()
    
    return [
        {
            "id": lora.id,
            "name": lora.name,
            "version": lora.version,
            "tags": lora.tags or [],
            "active": lora.active,
            "civitai_url": lora.civitai_url,
            "description": lora.description
        }
        for lora in featured_loras
    ]

@router.get("/activity-feed")
async def get_activity_feed():
    """Get recent activity feed for the dashboard."""
    
    # Mock activity data - would implement with actual activity tracking
    activities = [
        {
            "id": 1,
            "type": "import",
            "message": "Imported 3 new LoRAs",
            "timestamp": "2 hours ago",
            "icon": "📥"
        },
        {
            "id": 2,
            "type": "generation",
            "message": "Generated 5 images with AnimeMix LoRA",
            "timestamp": "4 hours ago",
            "icon": "🎨"
        },
        {
            "id": 3,
            "type": "recommendation",
            "message": "AI recommended 4 similar LoRAs",
            "timestamp": "6 hours ago",
            "icon": "🎯"
        },
        {
            "id": 4,
            "type": "activation",
            "message": "Activated RealisticVision LoRA",
            "timestamp": "1 day ago",
            "icon": "✅"
        }
    ]
    
    return activities
