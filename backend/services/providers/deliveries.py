"""Delivery service provider factories and protocols."""

from __future__ import annotations

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
        """Create a :class:`DeliveryService` instance."""
        ...


def make_delivery_service(
    repository: DeliveryJobRepository,
    *,
    queue_orchestrator: QueueOrchestrator,
) -> DeliveryService:
    """Create a :class:`DeliveryService` with a repository and queue orchestrator."""
    return DeliveryService(repository, queue_orchestrator=queue_orchestrator)


__all__ = [
    "DeliveryServiceFactory",
    "make_delivery_service",
]
