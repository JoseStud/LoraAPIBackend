from __future__ import annotations

from typing import Callable, Optional

from sqlmodel import Session

from .analytics import AnalyticsService
from .analytics_repository import AnalyticsRepository
from .core_container import CoreServiceRegistry
from .delivery_repository import DeliveryJobRepository
from .deliveries import DeliveryService
from .domain_container import DomainServiceRegistry
from .infra_container import InfrastructureServiceRegistry
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
    make_websocket_service,
)
from .queue import QueueOrchestrator, create_queue_orchestrator
from .recommendations import RecommendationService
from .service_registry import ServiceRegistry
from .storage import StorageService
from .system import SystemService
from .websocket import WebSocketService, websocket_service


class ServiceContainerBuilder:
    """Build composed service registries with cached infrastructure dependencies."""

    def __init__(
        self,
        *,
        storage_provider: Callable[[], StorageService] = make_storage_service,
        adapter_provider=make_adapter_service,
        archive_provider=make_archive_service,
        delivery_provider=make_delivery_service,
        compose_provider=make_compose_service,
        generation_provider=make_generation_service,
        generation_coordinator_provider=make_generation_coordinator,
        websocket_provider: Optional[Callable[[], WebSocketService]] = None,
        system_provider: Callable[[DeliveryService], SystemService] = make_system_service,
        analytics_provider: Callable[..., AnalyticsService] = make_analytics_service,
        recommendation_provider=make_recommendation_service,
        queue_orchestrator_factory: Callable[[], QueueOrchestrator] = create_queue_orchestrator,
        analytics_repository_factory: Callable[[Session], AnalyticsRepository] = AnalyticsRepository,
        delivery_repository_factory: Callable[[Session], DeliveryJobRepository] = DeliveryJobRepository,
        recommendation_gpu_detector: Callable[[], bool] = RecommendationService.is_gpu_available,
    ) -> None:
        self._storage_provider = storage_provider
        self._adapter_provider = adapter_provider
        self._archive_provider = archive_provider
        self._delivery_provider = delivery_provider
        self._compose_provider = compose_provider
        self._generation_provider = generation_provider
        self._generation_coordinator_provider = generation_coordinator_provider
        self._websocket_provider = (
            websocket_provider
            if websocket_provider is not None
            else (lambda: make_websocket_service(service=websocket_service))
        )
        self._system_provider = system_provider
        self._analytics_provider = analytics_provider
        self._recommendation_provider = recommendation_provider
        self._queue_orchestrator_factory = queue_orchestrator_factory
        self._analytics_repository_factory = analytics_repository_factory
        self._delivery_repository_factory = delivery_repository_factory
        self._recommendation_gpu_detector = recommendation_gpu_detector

        self._cached_queue_orchestrator: Optional[QueueOrchestrator] = None
        self._cached_gpu_available: Optional[bool] = None

    def _get_queue_orchestrator(self) -> QueueOrchestrator:
        if self._cached_queue_orchestrator is None:
            self._cached_queue_orchestrator = self._queue_orchestrator_factory()
        return self._cached_queue_orchestrator

    def _get_gpu_available(self) -> bool:
        if self._cached_gpu_available is None:
            self._cached_gpu_available = self._recommendation_gpu_detector()
        return self._cached_gpu_available

    def build(
        self,
        db_session: Optional[Session],
        *,
        queue_orchestrator: Optional[QueueOrchestrator] = None,
        delivery_repository: Optional[DeliveryJobRepository] = None,
        analytics_repository: Optional[AnalyticsRepository] = None,
        recommendation_gpu_available: Optional[bool] = None,
    ) -> ServiceRegistry:
        """Create a :class:`ServiceRegistry` wired with the configured dependencies."""

        queue = queue_orchestrator or self._get_queue_orchestrator()
        gpu_available = (
            recommendation_gpu_available
            if recommendation_gpu_available is not None
            else self._get_gpu_available()
        )

        if db_session is not None:
            delivery_repository = (
                delivery_repository
                if delivery_repository is not None
                else self._delivery_repository_factory(db_session)
            )
            analytics_repository = (
                analytics_repository
                if analytics_repository is not None
                else self._analytics_repository_factory(db_session)
            )

        core = CoreServiceRegistry(
            db_session,
            storage_provider=self._storage_provider,
            delivery_repository=delivery_repository,
            analytics_repository=analytics_repository,
        )

        domain = DomainServiceRegistry(
            core,
            db_session=db_session,
            analytics_repository=analytics_repository,
            adapter_provider=self._adapter_provider,
            compose_provider=self._compose_provider,
            generation_provider=self._generation_provider,
            analytics_provider=self._analytics_provider,
            recommendation_provider=self._recommendation_provider,
            recommendation_gpu_available=gpu_available,
        )

        infrastructure = InfrastructureServiceRegistry(
            core,
            domain,
            queue_orchestrator=queue,
            archive_provider=self._archive_provider,
            delivery_provider=self._delivery_provider,
            generation_coordinator_provider=self._generation_coordinator_provider,
            websocket_provider=self._websocket_provider,
            system_provider=self._system_provider,
        )

        return ServiceRegistry(core, domain, infrastructure)


__all__ = ["ServiceContainerBuilder"]
