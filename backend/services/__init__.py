from __future__ import annotations

from dataclasses import replace
from typing import Callable, Optional

from sqlmodel import Session

from backend.core.database import get_session

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
from .providers.analytics import make_analytics_service
from .providers.archive import make_archive_service
from .providers.deliveries import make_delivery_service
from .providers.generation import (
    make_compose_service,
    make_generation_coordinator,
    make_generation_service,
)
from .providers.recommendations import make_recommendation_service
from .providers.storage import (
    StorageProviders,
    make_adapter_service,
    make_storage_service,
)
from .providers.system import make_system_service
from .queue import QueueOrchestrator
from .service_container_builder import (
    DomainFactories,
    InfrastructureFactories,
    ServiceContainerBuilder,
)
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


class ServiceContainer:
    """Backward compatible wrapper around :class:`ServiceRegistry`."""

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
        storage_override = self._make_storage_override(
            storage_provider, adapter_provider
        )
        domain_override = self._make_domain_override(
            compose_provider,
            generation_provider,
            analytics_provider,
            recommendation_provider,
        )
        infrastructure_override = self._make_infrastructure_override(
            archive_provider,
            delivery_provider,
            generation_coordinator_provider,
            system_provider,
        )

        builder = _DEFAULT_BUILDER.with_overrides(
            storage=storage_override,
            domain=domain_override,
            infrastructure=infrastructure_override,
            websocket_factory=websocket_provider,
        )
        registry = builder.build(
            db_session,
            queue_orchestrator=queue_orchestrator,
            delivery_repository=delivery_repository,
            analytics_repository=analytics_repository,
            recommendation_gpu_available=recommendation_gpu_available,
        )
        self._registry = registry
        self._builder = builder
        self._generation_coordinator_override: Optional[GenerationCoordinator] = None

    def __getattr__(self, name: str):
        return getattr(self._registry, name)

    def __setattr__(self, name, value):
        if name == "_generation_coordinator":
            object.__setattr__(self, "_generation_coordinator_override", value)
            return
        super().__setattr__(name, value)

    @property
    def registry(self) -> ServiceRegistry:
        return self._registry

    @property
    def core(self) -> CoreServices:
        return self._registry.core

    @property
    def domain(self) -> DomainServices:
        return self._registry.domain

    @property
    def application(self) -> ApplicationServices:
        application_services = self._registry.application
        if self._generation_coordinator_override is None:
            return application_services
        return replace(
            application_services,
            _generation_coordinator_override=self._generation_coordinator_override,
        )

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        override = self._generation_coordinator_override
        if override is not None:
            return override
        return self._registry.generation_coordinator

    @staticmethod
    def _make_storage_override(
        storage_provider,
        adapter_provider,
    ) -> Optional[Callable[[StorageProviders], StorageProviders]]:
        updates = {}
        if storage_provider is not None:
            updates["storage"] = storage_provider
        if adapter_provider is not None:
            updates["adapter"] = adapter_provider
        if not updates:
            return None
        return lambda config, updates=updates: replace(config, **updates)

    @staticmethod
    def _make_domain_override(
        compose_provider,
        generation_provider,
        analytics_provider,
        recommendation_provider,
    ) -> Optional[Callable[[DomainFactories], DomainFactories]]:
        updates = {}
        if compose_provider is not None:
            updates["compose"] = compose_provider
        if generation_provider is not None:
            updates["generation"] = generation_provider
        if analytics_provider is not None:
            updates["analytics"] = analytics_provider
        if recommendation_provider is not None:
            updates["recommendation"] = recommendation_provider
        if not updates:
            return None
        return lambda config, updates=updates: replace(config, **updates)

    @staticmethod
    def _make_infrastructure_override(
        archive_provider,
        delivery_provider,
        generation_coordinator_provider,
        system_provider,
    ) -> Optional[Callable[[InfrastructureFactories], InfrastructureFactories]]:
        updates = {}
        if archive_provider is not None:
            updates["archive"] = archive_provider
        if delivery_provider is not None:
            updates["delivery"] = delivery_provider
        if generation_coordinator_provider is not None:
            updates["generation_coordinator"] = generation_coordinator_provider
        if system_provider is not None:
            updates["system"] = system_provider
        if not updates:
            return None
        return lambda config, updates=updates: replace(config, **updates)


def create_service_container(db_session: Session) -> ServiceRegistry:
    """Create a service registry for the provided database session."""
    return _DEFAULT_BUILDER.build(db_session)


__all__ = [
    "ApplicationServices",
    "CoreServices",
    "DomainServices",
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
    "get_session",
    "get_service_container_builder",
]
