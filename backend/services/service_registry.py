"""Facade exposing composed service registries to the application layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .adapters import AdapterService
from .analytics import AnalyticsService
from .archive import ArchiveService, BackupService
from .composition import ComposeService
from .core_container import CoreServiceRegistry
from .deliveries import DeliveryService
from .domain_container import DomainServiceRegistry
from .generation import GenerationCoordinator, GenerationService
from .infra_container import InfrastructureServiceRegistry
from .recommendations import RecommendationService
from .storage import StorageService
from .system import SystemService
from .websocket import WebSocketService


@dataclass(frozen=True)
class CoreServices:
    """Type-safe facade exposing core tier services."""

    _registry: CoreServiceRegistry

    @property
    def storage(self) -> StorageService:
        """Return the shared storage service."""
        return self._registry.storage


@dataclass(frozen=True)
class DomainServices:
    """Facade exposing domain service dependencies."""

    _registry: DomainServiceRegistry

    @property
    def adapters(self) -> AdapterService:
        """Return the adapter service facade."""
        return self._registry.adapters

    @property
    def compose(self) -> ComposeService:
        """Return the composition service facade."""
        return self._registry.compose

    @property
    def generation(self) -> GenerationService:
        """Return the generation service facade."""
        return self._registry.generation

    @property
    def analytics(self) -> AnalyticsService:
        """Return the analytics service facade."""
        return self._registry.analytics

    @property
    def recommendations(self) -> RecommendationService:
        """Return the recommendation service facade."""
        return self._registry.recommendations


@dataclass(frozen=True)
class ApplicationServices:
    """Facade exposing application tier services."""

    _registry: InfrastructureServiceRegistry
    _generation_coordinator_override: Optional[GenerationCoordinator] = None

    @property
    def archive(self) -> ArchiveService:
        """Return the archive service used for import/export."""
        return self._registry.archive

    @property
    def backups(self) -> BackupService:
        """Return the backup service responsible for history metadata."""
        return self._registry.backups

    @property
    def deliveries(self) -> DeliveryService:
        """Return the delivery service facade."""
        return self._registry.deliveries

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        """Return the generation coordinator, honoring overrides."""
        if self._generation_coordinator_override is not None:
            return self._generation_coordinator_override
        return self._registry.generation_coordinator

    @property
    def websocket(self) -> WebSocketService:
        """Return the WebSocket service facade."""
        return self._registry.websocket

    @property
    def system(self) -> SystemService:
        """Return the system status service facade."""
        return self._registry.system


class ServiceRegistry:
    """Facade exposing lazily constructed services from dedicated registries."""

    def __init__(
        self,
        core: CoreServiceRegistry,
        domain: DomainServiceRegistry,
        infrastructure: InfrastructureServiceRegistry,
    ) -> None:
        """Store component registries and initialise service facades."""
        self._core_registry = core
        self._domain_registry = domain
        self._infrastructure_registry = infrastructure

        self._core_services = CoreServices(core)
        self._domain_services = DomainServices(domain)
        self._application_services = ApplicationServices(infrastructure)

    @property
    def core(self) -> CoreServices:
        """Return the core service facade."""
        return self._core_services

    @property
    def domain(self) -> DomainServices:
        """Return the domain service facade."""
        return self._domain_services

    @property
    def application(self) -> ApplicationServices:
        """Return the application service facade."""
        return self._application_services

    @property
    def db_session(self):
        """Expose the database session associated with the registries."""
        return self._core_registry.db_session

    @property
    def storage(self) -> StorageService:
        """Return the storage service provided by the core registry."""
        return self.core.storage

    @property
    def adapters(self) -> AdapterService:
        """Return the adapter service facade."""
        return self.domain.adapters

    @property
    def archive(self) -> ArchiveService:
        """Return the archive service used for import/export."""
        return self.application.archive

    @property
    def backups(self) -> BackupService:
        """Return the backup service facade."""
        return self.application.backups

    @property
    def deliveries(self) -> DeliveryService:
        """Return the delivery service facade."""
        return self.application.deliveries

    @property
    def compose(self) -> ComposeService:
        """Return the compose service facade."""
        return self.domain.compose

    @property
    def generation(self) -> GenerationService:
        """Return the generation service facade."""
        return self.domain.generation

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        """Return the generation coordinator facade."""
        return self.application.generation_coordinator

    @property
    def websocket(self) -> WebSocketService:
        """Return the WebSocket service facade."""
        return self.application.websocket

    @property
    def system(self) -> SystemService:
        """Return the system service facade."""
        return self.application.system

    @property
    def analytics(self) -> AnalyticsService:
        """Return the analytics service facade."""
        return self.domain.analytics

    @property
    def recommendations(self) -> RecommendationService:
        """Return the recommendation service facade."""
        return self.domain.recommendations


__all__ = [
    "ApplicationServices",
    "CoreServices",
    "DomainServices",
    "ServiceRegistry",
]
