"""FastAPI-facing WebSocket service plumbing."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

from backend.core.logging import get_logger
from backend.schemas import WebSocketMessage, WebSocketSubscription

from .connection_manager import ConnectionManager

logger = get_logger(__name__)


class WebSocketService:
    """Accept progress WebSocket connections and handle their subscriptions.

    Job messages are sent through :attr:`manager` by the lifespan-owned
    :class:`~backend.services.websocket.job_monitor.JobProgressMonitor`.
    """

    def __init__(
        self,
        *,
        connection_manager: Optional[ConnectionManager] = None,
    ) -> None:
        """Use ``connection_manager`` or a new one."""
        self.manager = connection_manager or ConnectionManager()

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


# The process-wide service: its connections are what the job monitor reaches,
# which is why the API runs as a single process.
websocket_service = WebSocketService()


def get_websocket_service() -> WebSocketService:
    """Return the process-wide WebSocket service."""
    return websocket_service


__all__ = ["WebSocketService", "get_websocket_service", "websocket_service"]
