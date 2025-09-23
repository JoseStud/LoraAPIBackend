"""WebSocket service provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from ..websocket import WebSocketService, websocket_service


class WebSocketServiceFactory(Protocol):
    """Callable protocol for producing :class:`WebSocketService` instances."""

    def __call__(self) -> WebSocketService:
        ...


def make_websocket_service(
    *,
    service: Optional[WebSocketService] = None,
    connection_manager=None,
    job_monitor=None,
) -> WebSocketService:
    """Create or return a :class:`WebSocketService` configured with explicit collaborators."""

    if service is not None:
        return service
    return WebSocketService(connection_manager=connection_manager, job_monitor=job_monitor)


def default_websocket_service_factory() -> WebSocketService:
    """Return the application-wide WebSocket service instance."""

    return make_websocket_service(service=websocket_service)


@dataclass(frozen=True)
class WebSocketProviders:
    """Grouped websocket-related provider callables."""

    websocket: WebSocketServiceFactory = default_websocket_service_factory


__all__ = [
    "WebSocketProviders",
    "WebSocketServiceFactory",
    "default_websocket_service_factory",
    "make_websocket_service",
]

