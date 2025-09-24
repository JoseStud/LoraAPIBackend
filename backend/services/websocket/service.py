"""FastAPI-facing WebSocket service plumbing."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from backend.schemas import (
    GenerationComplete,
    ProgressUpdate,
    WebSocketMessage,
    WebSocketSubscription,
)

from .connection_manager import ConnectionManager
from .job_monitor import JobProgressMonitor
from .persistence import DeliveryJobStateRepository

logger = structlog.get_logger(__name__)


class WebSocketService:
    """Coordinate WebSocket connections with job monitoring fan-out."""

    def __init__(
        self,
        *,
        connection_manager: Optional[ConnectionManager] = None,
        job_monitor: Optional[JobProgressMonitor] = None,
    ) -> None:
        """Initialise WebSocket collaborators with sensible defaults."""
        self.manager = connection_manager or ConnectionManager()
        self.job_monitor = job_monitor or JobProgressMonitor(
            repository=DeliveryJobStateRepository(),
        )

    async def handle_connection(self, websocket: WebSocket) -> None:
        """Accept a WebSocket and process incoming messages."""
        connection_id = await self.manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                await self._handle_client_message(connection_id, data)
        except WebSocketDisconnect:
            self.manager.disconnect(connection_id)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.error("WebSocket error", connection_id=connection_id, error=str(exc))
            self.manager.disconnect(connection_id)

    async def _handle_client_message(self, connection_id: str, data: str) -> None:
        try:
            message = json.loads(data)
        except json.JSONDecodeError:
            logger.warning(
                "Failed to decode WebSocket message",
                connection_id=connection_id,
            )
            return

        if message.get("type") != "subscribe":
            return

        try:
            subscription = WebSocketSubscription(**message)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning(
                "Invalid subscription payload",
                connection_id=connection_id,
                error=str(exc),
            )
            return

        await self.manager.handle_subscription(connection_id, subscription)

        response = WebSocketMessage(
            type="subscription_confirmed",
            timestamp=datetime.now(timezone.utc),
            data={"job_ids": subscription.job_ids},
        )
        await self.manager.send_message(connection_id, response.model_dump())

    async def start_job_monitoring(self, job_id: str, generation_service) -> None:
        """Begin monitoring a job and broadcasting updates."""

        async def forward_progress(update: ProgressUpdate) -> None:
            await self.manager.broadcast_progress(job_id, update)

        async def forward_completion(message: GenerationComplete) -> None:
            await self.manager.broadcast_generation_complete(job_id, message)

        await self.job_monitor.start(
            job_id,
            generation_service,
            on_progress=forward_progress,
            on_complete=forward_completion,
        )

    def stop_job_monitoring(self, job_id: str) -> None:
        """Stop monitoring a job."""
        self.job_monitor.stop(job_id)


# Global WebSocket service instance used by dependency injection
websocket_service = WebSocketService()

__all__ = ["WebSocketService", "websocket_service"]
