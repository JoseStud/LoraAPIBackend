"""Generation workflow provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..composition import ComposeService
from ..deliveries import DeliveryService
from ..generation import GenerationCoordinator, GenerationService
from ..websocket import WebSocketService


class ComposeServiceFactory(Protocol):
    """Callable protocol for creating :class:`ComposeService` instances."""

    def __call__(self) -> ComposeService:
        ...


class GenerationServiceFactory(Protocol):
    """Callable protocol for creating :class:`GenerationService` instances."""

    def __call__(self) -> GenerationService:
        ...


class GenerationCoordinatorFactory(Protocol):
    """Callable protocol for creating :class:`GenerationCoordinator` instances."""

    def __call__(
        self,
        delivery_service: DeliveryService,
        websocket_service: WebSocketService,
        generation_service: GenerationService,
    ) -> GenerationCoordinator:
        ...


def make_compose_service() -> ComposeService:
    """Create a :class:`ComposeService`."""
    return ComposeService()


def make_generation_service() -> GenerationService:
    """Create a :class:`GenerationService`."""
    return GenerationService()


def make_generation_coordinator(
    delivery_service: DeliveryService,
    websocket_service: WebSocketService,
    generation_service: GenerationService,
) -> GenerationCoordinator:
    """Create a :class:`GenerationCoordinator` with its collaborators."""
    return GenerationCoordinator(delivery_service, websocket_service, generation_service)


@dataclass(frozen=True)
class GenerationProviders:
    """Grouped generation-related provider callables."""

    compose: ComposeServiceFactory = make_compose_service
    generation: GenerationServiceFactory = make_generation_service
    coordinator: GenerationCoordinatorFactory = make_generation_coordinator


__all__ = [
    "ComposeServiceFactory",
    "GenerationCoordinatorFactory",
    "GenerationProviders",
    "GenerationServiceFactory",
    "make_compose_service",
    "make_generation_coordinator",
    "make_generation_service",
]

