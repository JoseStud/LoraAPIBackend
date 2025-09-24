"""System service provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.core.config import settings

from ..deliveries import DeliveryService
from ..system import SystemService


class SystemServiceFactory(Protocol):
    """Callable protocol for creating :class:`SystemService` instances."""

    def __call__(
        self,
        delivery_service: DeliveryService,
    ) -> SystemService:
        """Create a :class:`SystemService` instance."""
        ...


def make_system_service(delivery_service: DeliveryService) -> SystemService:
    """Create a :class:`SystemService` bound to the delivery service."""
    return SystemService(
        delivery_service,
        queue_warning_active=settings.SYSTEM_QUEUE_WARNING_ACTIVE,
        queue_warning_failed=settings.SYSTEM_QUEUE_WARNING_FAILED,
        importer_stale_hours=settings.SYSTEM_IMPORTER_STALE_HOURS,
    )


@dataclass(frozen=True)
class SystemProviders:
    """Grouped system-related provider callables."""

    system: SystemServiceFactory = make_system_service


__all__ = [
    "SystemProviders",
    "SystemServiceFactory",
    "make_system_service",
]
