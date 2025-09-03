"""WebSocket router for real-time progress monitoring."""

from fastapi import APIRouter, Depends, WebSocket
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import create_service_container

router = APIRouter()


@router.websocket("/ws/progress")
async def websocket_progress_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_session),
):
    """WebSocket endpoint for real-time generation progress monitoring.
    
    Clients can connect to this endpoint to receive real-time updates about
    generation jobs. After connecting, send a subscription message:
    
    ```json
    {
        "type": "subscribe",
        "job_ids": ["job-1", "job-2"],  // or null for all jobs
        "include_previews": false
    }
    ```
    
    The server will send progress updates, generation started/completed notifications:
    
    ```json
    {
        "type": "progress_update",
        "timestamp": "2025-08-29T12:34:56Z",
        "data": {
            "job_id": "job-123",
            "progress": 0.75,
            "status": "running",
            "current_step": 15,
            "total_steps": 20,
            "eta_seconds": 5.2
        }
    }
    ```
    """
    container = create_service_container(db)
    await container.websocket.handle_connection(websocket)
