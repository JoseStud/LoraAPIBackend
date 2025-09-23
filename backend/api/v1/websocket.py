"""WebSocket router for real-time progress monitoring.

The canonical client-facing path for this socket is ``/api/v1/ws/progress``
when the backend is served through the main application (``app.main``). When
connecting directly to the backend service without the ``/api`` mount, the
route is available at ``/v1/ws/progress``. A legacy compatibility path without
versioning is also provided by ``backend.main`` so older clients that still use
``/ws/progress`` continue to function.
"""

from fastapi import APIRouter, Depends, WebSocket

from backend.core.dependencies import get_service_container
from backend.services import ServiceRegistry

router = APIRouter()


PROGRESS_WEBSOCKET_ROUTE = "/ws/progress"


@router.websocket(PROGRESS_WEBSOCKET_ROUTE)
async def websocket_progress_endpoint(
    websocket: WebSocket,
    container: ServiceRegistry = Depends(get_service_container),
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
    await container.websocket.handle_connection(websocket)
