"""Convenience imports and helpers for constructing service registries."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Optional

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

_builder_var: ContextVar[ServiceContainerBuilder] = ContextVar(
    "service_container_builder"
)


def _create_default_builder() -> ServiceContainerBuilder:
    return ServiceContainerBuilder()


def get_service_container_builder() -> ServiceContainerBuilder:
    """Return the current service container builder for this context."""
    try:
        return _builder_var.get()
    except LookupError:
        builder = _create_default_builder()
        _builder_var.set(builder)
        return builder


@contextmanager
def service_container_builder_scope(
    builder: Optional[ServiceContainerBuilder] = None,
) -> Iterator[ServiceContainerBuilder]:
    """Provide a scoped service container builder override."""
    token = _builder_var.set(builder or _create_default_builder())
    try:
        yield _builder_var.get()
    finally:
        _builder_var.reset(token)


def create_service_container(db_session: Session) -> ServiceRegistry:
    """Create a service registry for the provided database session."""
    return get_service_container_builder().build(db_session)


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
    "service_container_builder_scope",
]
