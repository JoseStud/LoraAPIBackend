from __future__ import annotations

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


class ServiceRegistry:
    """Facade exposing lazily constructed services from dedicated registries."""

    def __init__(
        self,
        core: CoreServiceRegistry,
        domain: DomainServiceRegistry,
        infrastructure: InfrastructureServiceRegistry,
    ) -> None:
        self._core = core
        self._domain = domain
        self._infrastructure = infrastructure

    @property
    def core(self) -> CoreServiceRegistry:
        """Return the underlying core registry."""

        return self._core

    @property
    def domain(self) -> DomainServiceRegistry:
        """Return the underlying domain registry."""

        return self._domain

    @property
    def infrastructure(self) -> InfrastructureServiceRegistry:
        """Return the underlying infrastructure registry."""

        return self._infrastructure

    @property
    def db_session(self):
        """Expose the database session associated with the registries."""

        return self._core.db_session

    @property
    def storage(self) -> StorageService:
        return self._core.storage

    @property
    def adapters(self) -> AdapterService:
        return self._domain.adapters

    @property
    def archive(self) -> ArchiveService:
        return self._infrastructure.archive

    @property
    def backups(self) -> BackupService:
        return self._infrastructure.backups

    @property
    def deliveries(self) -> DeliveryService:
        return self._infrastructure.deliveries

    @property
    def compose(self) -> ComposeService:
        return self._domain.compose

    @property
    def generation(self) -> GenerationService:
        return self._domain.generation

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        return self._infrastructure.generation_coordinator

    @property
    def websocket(self) -> WebSocketService:
        return self._infrastructure.websocket

    @property
    def system(self) -> SystemService:
        return self._infrastructure.system

    @property
    def analytics(self) -> AnalyticsService:
        return self._domain.analytics

    @property
    def recommendations(self) -> RecommendationService:
        return self._domain.recommendations


__all__ = ["ServiceRegistry"]
