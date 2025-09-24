"""Convenience imports and helpers for constructing service registries."""

from __future__ import annotations

from sqlmodel import Session

from .adapters import AdapterService
from .analytics import AnalyticsService, InsightGenerator, TimeSeriesBuilder
from .analytics_repository import AnalyticsRepository
from .archive import (
    ArchiveExportPlanner,
    ArchiveImportExecutor,
    ArchiveService,
    BackupService,
)
from .composition import ComposeService
from .deliveries import DeliveryService
from .delivery_repository import DeliveryJobRepository
from .generation import GenerationCoordinator, GenerationService
from .queue import QueueOrchestrator
from .service_container_builder import ServiceContainerBuilder
from .service_registry import (
    ApplicationServices,
    CoreServices,
    DomainServices,
    ServiceRegistry,
)
from .storage import StorageService
from .system import SystemService
from .websocket import WebSocketService

_DEFAULT_BUILDER = ServiceContainerBuilder()


def get_service_container_builder() -> ServiceContainerBuilder:
    """Return the shared service container builder."""
    return _DEFAULT_BUILDER


def create_service_container(db_session: Session) -> ServiceRegistry:
    """Create a service registry for the provided database session."""
    return _DEFAULT_BUILDER.build(db_session)


__all__ = [
    "ApplicationServices",
    "CoreServices",
    "DomainServices",
    "ServiceRegistry",
    "ServiceContainerBuilder",
    "create_service_container",
    "AdapterService",
    "AnalyticsService",
    "DeliveryService",
    "DeliveryJobRepository",
    "ComposeService",
    "GenerationService",
    "StorageService",
    "QueueOrchestrator",
    "get_service_container_builder",
]
