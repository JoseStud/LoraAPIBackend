"""The service container: one lazily wired registry per database session."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from typing import Callable, Optional

from sqlmodel import Session

from backend.core.config import settings

from .adapters import AdapterService
from .analytics import AnalyticsService
from .analytics_repository import AnalyticsRepository
from .archive import ArchiveService, BackupService
from .composition import ComposeService
from .deliveries import DeliveryService
from .delivery_repository import DeliveryJobRepository
from .generation import GenerationCoordinator, GenerationService
from .queue import QueueOrchestrator
from .recommendation_jobs import RecommendationJobService
from .recommendations import (
    EmbeddingService,
    RecommendationModelRegistry,
    RecommendationRepository,
    RecommendationService,
)
from .storage import StorageService, get_storage_backend
from .system import SystemService
from .websocket import WebSocketService, get_websocket_service


def make_storage_service() -> StorageService:
    """Create a :class:`StorageService` on the configured storage backend."""
    return StorageService(get_storage_backend())


def make_adapter_service(
    *,
    db_session: Session,
    storage_service: StorageService,
) -> AdapterService:
    """Create an :class:`AdapterService` on the storage service's backend."""
    return AdapterService(db_session, storage_backend=storage_service.backend)


def make_recommendation_service(
    db_session: Session,
    *,
    gpu_available: bool,
) -> RecommendationService:
    """Create a :class:`RecommendationService` bound to ``db_session``."""
    model_registry = RecommendationModelRegistry(gpu_enabled=gpu_available)
    repository = RecommendationRepository(db_session)
    return RecommendationService(
        repository=repository,
        embeddings=EmbeddingService(repository, model_registry),
        model_registry=model_registry,
    )


def make_system_service(delivery_service: DeliveryService) -> SystemService:
    """Create a :class:`SystemService` with the configured queue thresholds."""
    return SystemService(
        delivery_service,
        queue_warning_active=settings.SYSTEM_QUEUE_WARNING_ACTIVE,
        queue_warning_failed=settings.SYSTEM_QUEUE_WARNING_FAILED,
        importer_stale_hours=settings.SYSTEM_IMPORTER_STALE_HOURS,
    )


@dataclass(frozen=True)
class ServiceFactories:
    """The factory used to construct each service in a :class:`ServiceRegistry`.

    A default is the service class itself when the registry's arguments map
    straight onto its constructor, otherwise a ``make_*`` function (or, for
    the WebSocket service, the accessor of the process-wide instance).
    """

    storage: Callable[..., StorageService] = make_storage_service
    adapter: Callable[..., AdapterService] = make_adapter_service
    compose: Callable[..., ComposeService] = ComposeService
    generation: Callable[..., GenerationService] = GenerationService
    analytics: Callable[..., AnalyticsService] = AnalyticsService
    recommendation: Callable[..., RecommendationService] = make_recommendation_service
    recommendation_jobs: Callable[..., RecommendationJobService] = (
        RecommendationJobService
    )
    archive: Callable[..., ArchiveService] = ArchiveService
    delivery: Callable[..., DeliveryService] = DeliveryService
    generation_coordinator: Callable[..., GenerationCoordinator] = GenerationCoordinator
    websocket: Callable[..., WebSocketService] = get_websocket_service
    system: Callable[..., SystemService] = make_system_service


class ServiceRegistry:
    """Expose every backend service, each built on first access and then cached.

    Missing collaborators are reported when the service that needs them is
    first requested, so a registry built without a queue orchestrator can
    still serve adapters.
    """

    def __init__(
        self,
        db_session: Optional[Session],
        *,
        queue_orchestrator: Optional[QueueOrchestrator] = None,
        delivery_repository: Optional[DeliveryJobRepository] = None,
        analytics_repository: Optional[AnalyticsRepository] = None,
        recommendation_gpu_available: Optional[bool] = None,
        factories: Optional[ServiceFactories] = None,
    ) -> None:
        """Store the session, shared collaborators and service factories."""
        self.db_session = db_session
        self._queue_orchestrator = queue_orchestrator
        self._delivery_repository = delivery_repository
        self._analytics_repository = analytics_repository
        self._recommendation_gpu_available = recommendation_gpu_available
        self._factories = factories or ServiceFactories()

    def _require_session(self, service_name: str) -> Session:
        if self.db_session is None:
            raise ValueError(f"{service_name} requires an active database session")
        return self.db_session

    @cached_property
    def storage(self) -> StorageService:
        """Return the storage service."""
        return self._factories.storage()

    @cached_property
    def adapters(self) -> AdapterService:
        """Return the adapter service bound to the session."""
        session = self._require_session("AdapterService")
        return self._factories.adapter(
            db_session=session,
            storage_service=self.storage,
        )

    @cached_property
    def compose(self) -> ComposeService:
        """Return the compose service."""
        return self._factories.compose()

    @cached_property
    def generation(self) -> GenerationService:
        """Return the generation service."""
        return self._factories.generation()

    @cached_property
    def analytics(self) -> AnalyticsService:
        """Return the analytics service bound to the session."""
        session = self._require_session("AnalyticsService")
        if self._analytics_repository is None:
            raise ValueError("AnalyticsService requires an analytics repository")
        return self._factories.analytics(
            session,
            repository=self._analytics_repository,
        )

    @cached_property
    def recommendations(self) -> RecommendationService:
        """Return the recommendation service bound to the session."""
        session = self._require_session("RecommendationService")
        if self._recommendation_gpu_available is None:
            raise ValueError(
                "RecommendationService requires an explicit "
                "recommendation_gpu_available flag",
            )
        return self._factories.recommendation(
            session,
            gpu_available=self._recommendation_gpu_available,
        )

    @cached_property
    def recommendation_jobs(self) -> RecommendationJobService:
        """Return the service that queues long-running recommendation work."""
        if self._queue_orchestrator is None:
            raise ValueError("RecommendationJobService requires a queue orchestrator")
        if self._recommendation_gpu_available is None:
            raise ValueError(
                "RecommendationJobService requires an explicit "
                "recommendation_gpu_available flag",
            )
        return self._factories.recommendation_jobs(
            self._queue_orchestrator,
            gpu_available=self._recommendation_gpu_available,
        )

    @cached_property
    def archive(self) -> ArchiveService:
        """Return the archive service used for import/export."""
        return self._factories.archive(self.adapters, self.storage)

    @cached_property
    def backups(self) -> BackupService:
        """Return the backup service derived from the archive service."""
        return BackupService(self.archive)

    @cached_property
    def deliveries(self) -> DeliveryService:
        """Return the delivery service bound to the repository and queue."""
        self._require_session("DeliveryService")
        if self._queue_orchestrator is None:
            raise ValueError("DeliveryService requires a queue orchestrator")
        if self._delivery_repository is None:
            raise ValueError("DeliveryService requires a delivery repository")
        return self._factories.delivery(
            self._delivery_repository,
            queue_orchestrator=self._queue_orchestrator,
        )

    @cached_property
    def websocket(self) -> WebSocketService:
        """Return the WebSocket service."""
        return self._factories.websocket()

    @cached_property
    def system(self) -> SystemService:
        """Return the system status service."""
        return self._factories.system(self.deliveries)

    @cached_property
    def generation_coordinator(self) -> GenerationCoordinator:
        """Return the coordinator tying deliveries and generation together."""
        return self._factories.generation_coordinator(
            self.deliveries,
            self.generation,
        )


__all__ = [
    "ServiceFactories",
    "ServiceRegistry",
    "make_adapter_service",
    "make_recommendation_service",
    "make_storage_service",
    "make_system_service",
]
