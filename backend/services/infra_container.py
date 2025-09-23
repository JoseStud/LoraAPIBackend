from __future__ import annotations

from typing import Optional

from .archive import ArchiveService, BackupService
from .core_container import CoreServiceRegistry
from .deliveries import DeliveryService
from .domain_container import DomainServiceRegistry
from .generation import GenerationCoordinator
from .providers.archive import ArchiveServiceFactory, make_archive_service
from .providers.deliveries import DeliveryServiceFactory, make_delivery_service
from .providers.generation import (
    GenerationCoordinatorFactory,
    make_generation_coordinator,
)
from .providers.system import SystemServiceFactory, make_system_service
from .providers.websocket import (
    WebSocketServiceFactory,
    default_websocket_service_factory,
)
from .queue import QueueOrchestrator
from .system import SystemService
from .websocket import WebSocketService


class InfrastructureServiceRegistry:
    """Provide infrastructure oriented services built on domain registries."""

    def __init__(
        self,
        core: CoreServiceRegistry,
        domain: DomainServiceRegistry,
        *,
        queue_orchestrator: Optional[QueueOrchestrator],
        archive_provider: ArchiveServiceFactory = make_archive_service,
        delivery_provider: DeliveryServiceFactory = make_delivery_service,
        generation_coordinator_provider: GenerationCoordinatorFactory = make_generation_coordinator,
        websocket_provider: Optional[WebSocketServiceFactory] = None,
        system_provider: SystemServiceFactory = make_system_service,
    ) -> None:
        self._core = core
        self._domain = domain
        self._queue_orchestrator = queue_orchestrator
        self._archive_provider = archive_provider
        self._delivery_provider = delivery_provider
        self._generation_coordinator_provider = generation_coordinator_provider
        self._websocket_provider = (
            websocket_provider
            if websocket_provider is not None
            else default_websocket_service_factory
        )
        self._system_provider = system_provider

        self._archive_service: Optional[ArchiveService] = None
        self._backup_service: Optional[BackupService] = None
        self._delivery_service: Optional[DeliveryService] = None
        self._generation_coordinator: Optional[GenerationCoordinator] = None
        self._websocket_service: Optional[WebSocketService] = None
        self._system_service: Optional[SystemService] = None

    @property
    def archive(self) -> ArchiveService:
        """Return the archive service."""

        if self._archive_service is None:
            self._archive_service = self._archive_provider(
                self._domain.adapters,
                self._core.storage,
            )
        return self._archive_service

    @property
    def backups(self) -> BackupService:
        """Return the backup service derived from the archive service."""

        if self._backup_service is None:
            self._backup_service = BackupService(self.archive)
        return self._backup_service

    @property
    def deliveries(self) -> DeliveryService:
        """Return the delivery service configured with orchestrator and repository."""

        if self._domain.db_session is None:
            raise ValueError("DeliveryService requires an active database session")
        if self._queue_orchestrator is None:
            raise ValueError("DeliveryService requires a queue orchestrator")
        if self._delivery_service is None:
            repository = self._core.delivery_repository
            self._delivery_service = self._delivery_provider(
                repository,
                queue_orchestrator=self._queue_orchestrator,
            )
        return self._delivery_service

    @property
    def websocket(self) -> WebSocketService:
        """Return the websocket service."""

        if self._websocket_service is None:
            self._websocket_service = self._websocket_provider()
        return self._websocket_service

    @property
    def system(self) -> SystemService:
        """Return the system service monitoring delivery status."""

        if self._system_service is None:
            self._system_service = self._system_provider(self.deliveries)
        return self._system_service

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        """Return the generation coordinator tying together key services."""

        if self._generation_coordinator is None:
            self._generation_coordinator = self._generation_coordinator_provider(
                self.deliveries,
                self.websocket,
                self._domain.generation,
            )
        return self._generation_coordinator


__all__ = ["InfrastructureServiceRegistry"]
