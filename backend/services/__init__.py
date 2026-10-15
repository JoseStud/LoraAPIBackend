"""Convenience imports and helpers for constructing service registries."""

from __future__ import annotations

import threading
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
from .service_registry import ServiceFactories, ServiceRegistry
from .storage import StorageService
from .system import SystemService
from .websocket import WebSocketService

# The default builder is shared by the whole process. FastAPI runs each request
# (and each sync dependency) in a copied ``contextvars`` context, so a value set
# lazily inside a request never reaches the next one; keeping the default in a
# ContextVar created a new builder, queue orchestrator and GPU probe per request.
_default_builder: Optional[ServiceContainerBuilder] = None
_default_builder_lock = threading.Lock()

# Holds only an explicit override installed by ``service_container_builder_scope``.
_builder_var: ContextVar[Optional[ServiceContainerBuilder]] = ContextVar(
    "service_container_builder", default=None
)


def _create_default_builder() -> ServiceContainerBuilder:
    return ServiceContainerBuilder()


def _get_default_builder() -> ServiceContainerBuilder:
    global _default_builder

    builder = _default_builder
    if builder is None:
        with _default_builder_lock:
            builder = _default_builder
            if builder is None:
                builder = _create_default_builder()
                _default_builder = builder
    return builder


def get_service_container_builder() -> ServiceContainerBuilder:
    """Return the scoped override if one is active, else the process-wide builder."""
    override = _builder_var.get()
    if override is not None:
        return override
    return _get_default_builder()


@contextmanager
def service_container_builder_scope(
    builder: Optional[ServiceContainerBuilder] = None,
) -> Iterator[ServiceContainerBuilder]:
    """Override the service container builder for the current context.

    Intended for tests and scripts. Without ``builder`` a fresh, isolated
    builder is used. The previous builder is restored on exit.
    """
    scoped = builder or _create_default_builder()
    token = _builder_var.set(scoped)
    try:
        yield scoped
    finally:
        _builder_var.reset(token)


def create_service_container(db_session: Session) -> ServiceRegistry:
    """Create a service registry for the provided database session."""
    return get_service_container_builder().build(db_session)


__all__ = [
    "ServiceFactories",
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
