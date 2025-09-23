"""Delivery service provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..deliveries import DeliveryService
from ..delivery_repository import DeliveryJobRepository
from ..queue import QueueOrchestrator


class DeliveryServiceFactory(Protocol):
    """Callable protocol for creating :class:`DeliveryService` instances."""

    def __call__(
        self,
        repository: DeliveryJobRepository,
        *,
        queue_orchestrator: QueueOrchestrator,
    ) -> DeliveryService:
        ...


def make_delivery_service(
    repository: DeliveryJobRepository,
    *,
    queue_orchestrator: QueueOrchestrator,
) -> DeliveryService:
    """Create a :class:`DeliveryService` with explicit repository and queue orchestrator."""
    return DeliveryService(repository, queue_orchestrator=queue_orchestrator)


@dataclass(frozen=True)
class DeliveryProviders:
    """Grouped delivery-related provider callables."""

    delivery: DeliveryServiceFactory = make_delivery_service


__all__ = [
    "DeliveryProviders",
    "DeliveryServiceFactory",
    "make_delivery_service",
]

