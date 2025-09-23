from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Callable, Optional

from sqlmodel import Session

from .analytics_repository import AnalyticsRepository
from .core_container import CoreServiceRegistry
from .delivery_repository import DeliveryJobRepository
from .domain_container import DomainServiceRegistry
from .infra_container import InfrastructureServiceRegistry
from .providers.analytics import AnalyticsServiceFactory, make_analytics_service
from .providers.archive import ArchiveServiceFactory, make_archive_service
from .providers.deliveries import DeliveryServiceFactory, make_delivery_service
from .providers.generation import (
    ComposeServiceFactory,
    GenerationCoordinatorFactory,
    GenerationServiceFactory,
    make_compose_service,
    make_generation_coordinator,
    make_generation_service,
)
from .providers.recommendations import (
    RecommendationServiceFactory,
    make_recommendation_service,
)
from .providers.storage import StorageProviders
from .providers.system import SystemServiceFactory, make_system_service
from .providers.websocket import (
    WebSocketServiceFactory,
    default_websocket_service_factory,
)
from .queue import QueueOrchestrator, create_queue_orchestrator
from .recommendations import RecommendationService
from .service_registry import ServiceRegistry


@dataclass(frozen=True)
class DomainFactories:
    """Grouped domain-level service factories."""

    compose: ComposeServiceFactory = make_compose_service
    generation: GenerationServiceFactory = make_generation_service
    analytics: AnalyticsServiceFactory = make_analytics_service
    recommendation: RecommendationServiceFactory = make_recommendation_service


@dataclass(frozen=True)
class InfrastructureFactories:
    """Grouped infrastructure-level service factories."""

    archive: ArchiveServiceFactory = make_archive_service
    delivery: DeliveryServiceFactory = make_delivery_service
    generation_coordinator: GenerationCoordinatorFactory = make_generation_coordinator
    websocket: WebSocketServiceFactory = default_websocket_service_factory
    system: SystemServiceFactory = make_system_service


class ServiceContainerBuilder:
    """Build composed service registries with cached infrastructure dependencies."""

    def __init__(
        self,
        *,
        storage: StorageProviders = StorageProviders(),
        domain_factories: DomainFactories = DomainFactories(),
        infrastructure_factories: InfrastructureFactories = InfrastructureFactories(),
        websocket_factory: Optional[WebSocketServiceFactory] = None,
        queue_orchestrator_factory: Callable[[], QueueOrchestrator] = create_queue_orchestrator,
        analytics_repository_factory: Callable[[Session], AnalyticsRepository] = AnalyticsRepository,
        delivery_repository_factory: Callable[[Session], DeliveryJobRepository] = DeliveryJobRepository,
        recommendation_gpu_detector: Callable[[], bool] = RecommendationService.is_gpu_available,
    ) -> None:
        if websocket_factory is not None:
            infrastructure_factories = replace(
                infrastructure_factories, websocket=websocket_factory,
            )

        self._storage = storage
        self._domain_factories = domain_factories
        self._infrastructure_factories = infrastructure_factories
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
            storage_provider=self._storage.storage,
            delivery_repository=delivery_repository,
            analytics_repository=analytics_repository,
        )

        domain = DomainServiceRegistry(
            core,
            db_session=db_session,
            analytics_repository=analytics_repository,
            adapter_provider=self._storage.adapter,
            compose_provider=self._domain_factories.compose,
            generation_provider=self._domain_factories.generation,
            analytics_provider=self._domain_factories.analytics,
            recommendation_provider=self._domain_factories.recommendation,
            recommendation_gpu_available=gpu_available,
        )

        infrastructure = InfrastructureServiceRegistry(
            core,
            domain,
            queue_orchestrator=queue,
            archive_provider=self._infrastructure_factories.archive,
            delivery_provider=self._infrastructure_factories.delivery,
            generation_coordinator_provider=self._infrastructure_factories.generation_coordinator,
            websocket_provider=self._infrastructure_factories.websocket,
            system_provider=self._infrastructure_factories.system,
        )

        return ServiceRegistry(core, domain, infrastructure)


__all__ = ["ServiceContainerBuilder"]
