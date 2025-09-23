from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from backend.core.database import get_session, get_session_context

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
from .providers import (
    make_adapter_service,
    make_analytics_service,
    make_archive_service,
    make_compose_service,
    make_delivery_service,
    make_generation_coordinator,
    make_generation_service,
    make_recommendation_service,
    make_storage_service,
    make_system_service,
)
from .queue import QueueOrchestrator
from .service_container_builder import ServiceContainerBuilder
from .service_registry import ServiceRegistry
from .storage import StorageService, get_storage_service
from .system import SystemService
from .websocket import WebSocketService


_DEFAULT_BUILDER = ServiceContainerBuilder()


def get_service_container_builder() -> ServiceContainerBuilder:
    """Return the shared service container builder."""

    return _DEFAULT_BUILDER


class ServiceContainer(ServiceRegistry):
    """Backward compatible wrapper that delegates to :class:`ServiceRegistry`."""

    def __init__(
        self,
        db_session: Optional[Session],
        *,
        queue_orchestrator: Optional[QueueOrchestrator] = None,
        delivery_repository: Optional[DeliveryJobRepository] = None,
        analytics_repository: Optional[AnalyticsRepository] = None,
        recommendation_gpu_available: Optional[bool] = None,
        storage_provider=None,
        adapter_provider=make_adapter_service,
        archive_provider=make_archive_service,
        delivery_provider=make_delivery_service,
        compose_provider=make_compose_service,
        generation_provider=make_generation_service,
        generation_coordinator_provider=make_generation_coordinator,
        websocket_provider=None,
        system_provider=make_system_service,
        analytics_provider=make_analytics_service,
        recommendation_provider=make_recommendation_service,
    ) -> None:
        effective_storage_provider = (
            storage_provider if storage_provider is not None else _DEFAULT_BUILDER._storage_provider
        )

        builder = ServiceContainerBuilder(
            storage_provider=effective_storage_provider,
            adapter_provider=adapter_provider,
            archive_provider=archive_provider,
            delivery_provider=delivery_provider,
            compose_provider=compose_provider,
            generation_provider=generation_provider,
            generation_coordinator_provider=generation_coordinator_provider,
            websocket_provider=websocket_provider,
            system_provider=system_provider,
            analytics_provider=analytics_provider,
            recommendation_provider=recommendation_provider,
        )
        registry = builder.build(
            db_session,
            queue_orchestrator=queue_orchestrator,
            delivery_repository=delivery_repository,
            analytics_repository=analytics_repository,
            recommendation_gpu_available=recommendation_gpu_available,
        )
        super().__init__(registry.core, registry.domain, registry.infrastructure)
        self._builder = builder
        self._generation_coordinator_override: Optional[GenerationCoordinator] = None

    def __setattr__(self, name, value):
        if name == "_generation_coordinator":
            object.__setattr__(self, "_generation_coordinator_override", value)
        else:
            super().__setattr__(name, value)

    @property
    def generation_coordinator(self) -> GenerationCoordinator:  # type: ignore[override]
        override = getattr(self, "_generation_coordinator_override", None)
        if override is not None:
            return override
        return super().generation_coordinator


def create_service_container(db_session: Session) -> ServiceRegistry:
    """Create a service registry for the provided database session."""

    return _DEFAULT_BUILDER.build(db_session)


def file_exists(path: str) -> bool:
    """Legacy helper to validate file paths via the storage service."""

    storage_service = get_storage_service()
    return storage_service.validate_file_path(path)


def get_adapter_service(db_session: Session) -> AdapterService:
    """Return an adapter service instance for the provided session."""

    container = _DEFAULT_BUILDER.build(db_session)
    return container.adapters


def get_delivery_service(db_session: Session) -> DeliveryService:
    """Return a delivery service instance for the provided session."""

    container = _DEFAULT_BUILDER.build(db_session)
    return container.deliveries


def get_compose_service() -> ComposeService:
    """Return a compose service instance."""

    container = _DEFAULT_BUILDER.build(None)
    return container.compose


def get_generation_service() -> GenerationService:
    """Return a generation service instance."""

    container = _DEFAULT_BUILDER.build(None)
    return container.generation


def upsert_adapter_from_payload(payload):
    """Upsert an adapter from payload for importer compatibility."""

    from backend.schemas import AdapterCreate

    if isinstance(payload, dict):
        payload = AdapterCreate(**payload)

    with get_session_context() as session:
        container = _DEFAULT_BUILDER.build(session)
        return container.adapters.upsert_adapter(payload)


__all__ = [
    "ServiceRegistry",
    "ServiceContainer",
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
    "get_adapter_service",
    "get_delivery_service",
    "get_compose_service",
    "get_generation_service",
    "get_session",
    "file_exists",
    "upsert_adapter_from_payload",
    "get_service_container_builder",
]
