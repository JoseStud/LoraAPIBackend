"""Connection management for WebSocket clients."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Set

import structlog
from fastapi import WebSocket

from backend.schemas import (
    GenerationComplete,
    GenerationStarted,
    ProgressUpdate,
    WebSocketMessage,
    WebSocketSubscription,
)

logger = structlog.get_logger(__name__)


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


class ConnectionManager:
    """Manage WebSocket connections and subscription routing."""

    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}
        self.job_subscriptions: Dict[str, Set[str]] = {}
        self.connection_subscriptions: Dict[str, Set[str]] = {}
        self.global_subscribers: Set[str] = set()
        self._connection_counter = 0

    async def connect(self, websocket: WebSocket) -> str:
        """Accept a new connection and return an internal identifier."""
        await websocket.accept()

        self._connection_counter += 1
        connection_id = (
            f"conn_{self._connection_counter}_{int(datetime.now().timestamp())}"
        )

        self.active_connections[connection_id] = websocket
        self.connection_subscriptions[connection_id] = set()

        logger.info("WebSocket connected", connection_id=connection_id)

        welcome_msg = WebSocketMessage(
            type="connected",
            timestamp=datetime.now(timezone.utc),
            data={
                "connection_id": connection_id,
                "message": "Connected to progress monitoring",
            },
        )
        await self._send_to_connection(connection_id, welcome_msg.model_dump())

        return connection_id

    def disconnect(self, connection_id: str) -> None:
        """Clean up tracking for a disconnected client."""
        if connection_id not in self.active_connections:
            return

        self.global_subscribers.discard(connection_id)

        if connection_id in self.connection_subscriptions:
            for job_id in self.connection_subscriptions[connection_id]:
                subscribers = self.job_subscriptions.get(job_id)
                if not subscribers:
                    continue
                subscribers.discard(connection_id)
                if not subscribers:
                    del self.job_subscriptions[job_id]
            del self.connection_subscriptions[connection_id]

        del self.active_connections[connection_id]
        logger.info("WebSocket disconnected", connection_id=connection_id)

    async def handle_subscription(
        self,
        connection_id: str,
        subscription: WebSocketSubscription,
    ) -> None:
        """Update routing tables based on a subscription request."""
        if subscription.job_ids is None:
            self.global_subscribers.add(connection_id)
            logger.info(
                "Connection subscribed to all jobs",
                connection_id=connection_id,
            )
            return

        for job_id in subscription.job_ids:
            subscribers = self.job_subscriptions.setdefault(job_id, set())
            subscribers.add(connection_id)
            self.connection_subscriptions.setdefault(connection_id, set()).add(job_id)

        logger.info(
            "Connection subscribed to jobs",
            connection_id=connection_id,
            job_ids=subscription.job_ids,
        )

    async def broadcast_progress(
        self,
        job_id: str,
        progress_data: ProgressUpdate,
    ) -> None:
        """Fan out a progress update to interested connections."""
        message = WebSocketMessage(
            type="progress_update",
            timestamp=datetime.now(timezone.utc),
            data=progress_data.model_dump(),
        )
        interested = self._interested_connections(job_id)
        await self._broadcast_to_connections(interested, message.model_dump())

        logger.debug(
            "Broadcasted progress update",
            job_id=job_id,
            progress=progress_data.progress,
            connections_count=len(interested),
        )

    async def broadcast_generation_started(
        self,
        job_id: str,
        started_data: GenerationStarted,
    ) -> None:
        """Fan out a generation-started notification."""
        message = WebSocketMessage(
            type="generation_started",
            timestamp=datetime.now(timezone.utc),
            data=started_data.model_dump(),
        )
        await self._broadcast(job_id, message.model_dump())
        logger.info("Broadcasted generation started", job_id=job_id)

    async def broadcast_generation_complete(
        self,
        job_id: str,
        complete_data: GenerationComplete,
    ) -> None:
        """Fan out a generation completion notification."""
        message = WebSocketMessage(
            type="generation_complete",
            timestamp=datetime.now(timezone.utc),
            data=complete_data.model_dump(),
        )
        await self._broadcast(job_id, message.model_dump())
        logger.info(
            "Broadcasted generation complete",
            job_id=job_id,
            status=complete_data.status,
        )

    async def send_message(
        self,
        connection_id: str,
        message: Dict[str, object],
    ) -> None:
        """Send a direct message to a specific connection."""
        await self._send_to_connection(connection_id, message)

    async def _broadcast(self, job_id: str, message: Dict[str, object]) -> None:
        interested_connections = self._interested_connections(job_id)
        await self._broadcast_to_connections(interested_connections, message)

    def _interested_connections(self, job_id: str) -> Set[str]:
        interested_connections = set(self.global_subscribers)
        if job_id in self.job_subscriptions:
            interested_connections.update(self.job_subscriptions[job_id])
        return interested_connections

    async def _send_to_connection(
        self, connection_id: str, message: Dict[str, object]
    ) -> None:
        if connection_id not in self.active_connections:
            return

        websocket = self.active_connections[connection_id]
        try:
            await websocket.send_text(json.dumps(message, default=_json_default))
        except Exception as exc:  # pragma: no cover - defensive cleanup
            logger.warning(
                "Failed to send WebSocket message",
                connection_id=connection_id,
                error=str(exc),
            )
            self.disconnect(connection_id)

    async def _broadcast_to_connections(
        self,
        connection_ids: Set[str],
        message: Dict[str, object],
    ) -> None:
        if not connection_ids:
            return

        tasks = [
            self._send_to_connection(connection_id, message)
            for connection_id in connection_ids
            if connection_id in self.active_connections
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


__all__ = ["ConnectionManager"]
