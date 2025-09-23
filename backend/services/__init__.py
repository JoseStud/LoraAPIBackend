"""Service layer initialization and dependency injection."""

from typing import Optional

from sqlmodel import Session

# Import file_exists for test compatibility - use root level for backward compatibility
from backend.services.storage import get_storage_service

from .adapters import AdapterService
from .analytics import AnalyticsService, InsightGenerator, TimeSeriesBuilder
from .analytics_repository import AnalyticsRepository
from .archive import ArchiveService
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
    make_websocket_service,
)
from .queue import QueueOrchestrator, create_queue_orchestrator
from .storage import StorageService
from .recommendations import RecommendationService
from .system import SystemService
from .websocket import WebSocketService, websocket_service


_GPU_AVAILABLE: Optional[bool] = None


def _get_recommendation_gpu_available() -> bool:
    """Detect and cache GPU availability for recommendation services."""

    global _GPU_AVAILABLE
    if _GPU_AVAILABLE is None:
        _GPU_AVAILABLE = RecommendationService.is_gpu_available()
    return _GPU_AVAILABLE


def file_exists(path: str) -> bool:
    """Legacy file_exists function for backward compatibility."""
    storage_service = get_storage_service()
    return storage_service.validate_file_path(path)

# Import db.get_session for backward compatibility with importer
from backend.core.database import get_session, get_session_context


class ServiceContainer:
    """Container for managing service dependencies."""

    def __init__(
        self,
        db_session: Optional[Session],
        *,
        queue_orchestrator: Optional[QueueOrchestrator] = None,
        delivery_repository: Optional[DeliveryJobRepository] = None,
        analytics_repository: Optional[AnalyticsRepository] = None,
        recommendation_gpu_available: Optional[bool] = None,
        storage_provider=make_storage_service,
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
    ):
        """Initialize service container.

        Args:
            db_session: Database session for services that need it.
            queue_orchestrator: Optional queue orchestrator shared with workers.
            delivery_repository: Optional pre-configured delivery repository.

        """
        self.db_session = db_session
        self._storage_service: Optional[StorageService] = None
        self._adapter_service: Optional[AdapterService] = None
        self._delivery_service: Optional[DeliveryService] = None
        self._compose_service: Optional[ComposeService] = None
        self._generation_service: Optional[GenerationService] = None
        self._generation_coordinator: Optional[GenerationCoordinator] = None
        self._websocket_service: Optional[WebSocketService] = None
        self._system_service: Optional[SystemService] = None
        self._archive_service: Optional[ArchiveService] = None
        self._analytics_service: Optional[AnalyticsService] = None
        self._recommendation_service: Optional[RecommendationService] = None
        self._analytics_repository = analytics_repository
        self._recommendation_gpu_available: Optional[bool] = recommendation_gpu_available
        self._queue_orchestrator = queue_orchestrator
        self._delivery_repository = delivery_repository
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

    @property
    def storage(self) -> StorageService:
        """Get storage service instance."""
        if self._storage_service is None:
            self._storage_service = self._storage_provider()
        return self._storage_service
    
    @property
    def adapters(self) -> AdapterService:
        """Get adapter service instance."""
        if self.db_session is None:
            raise ValueError("AdapterService requires an active database session")

        if self._adapter_service is None:
            self._adapter_service = self._adapter_provider(
                db_session=self.db_session,
                storage_service=self.storage,
            )
        return self._adapter_service

    @property
    def archive(self) -> ArchiveService:
        """Get archive service instance."""

        if self._archive_service is None:
            self._archive_service = self._archive_provider(
                self.adapters,
                self.storage,
            )
        return self._archive_service
    
    @property
    def deliveries(self) -> DeliveryService:
        """Get delivery service instance."""
        if self.db_session is None:
            raise ValueError("DeliveryService requires an active database session")

        if self._delivery_repository is None:
            raise ValueError("DeliveryService requires a delivery repository")
        if self._queue_orchestrator is None:
            raise ValueError("DeliveryService requires a queue orchestrator")

        if self._delivery_service is None:
            self._delivery_service = self._delivery_provider(
                self._delivery_repository,
                queue_orchestrator=self._queue_orchestrator,
            )
        return self._delivery_service
    
    @property
    def compose(self) -> ComposeService:
        """Get compose service instance."""
        if self._compose_service is None:
            self._compose_service = self._compose_provider()
        return self._compose_service
    
    @property
    def generation(self) -> GenerationService:
        """Get generation service instance."""
        if self._generation_service is None:
            self._generation_service = self._generation_provider()
        return self._generation_service

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        """Get generation coordinator helper."""

        if self._generation_coordinator is None:
            self._generation_coordinator = self._generation_coordinator_provider(
                self.deliveries,
                self.websocket,
                self.generation,
            )
        return self._generation_coordinator

    @property
    def websocket(self) -> WebSocketService:
        """Get WebSocket service instance."""
        if self._websocket_service is None:
            self._websocket_service = self._websocket_provider()
        return self._websocket_service

    @property
    def system(self) -> SystemService:
        """Get system monitoring service instance."""

        if self._system_service is None:
            self._system_service = self._system_provider(self.deliveries)
        return self._system_service

    @property
    def analytics(self) -> AnalyticsService:
        """Get analytics service instance."""

        if self.db_session is None:
            raise ValueError("AnalyticsService requires an active database session")

        if self._analytics_repository is None:
            raise ValueError("AnalyticsService requires an analytics repository")

        if self._analytics_service is None:
            self._analytics_service = self._analytics_provider(
                self.db_session,
                repository=self._analytics_repository,
            )
        return self._analytics_service

    @property
    def recommendations(self) -> RecommendationService:
        """Get recommendation service instance with cached GPU availability."""

        if self.db_session is None:
            raise ValueError("RecommendationService requires an active database session")

        if self._recommendation_gpu_available is None:
            raise ValueError(
                "RecommendationService requires an explicit recommendation_gpu_available flag"
            )

        if self._recommendation_service is None:
            self._recommendation_service = self._recommendation_provider(
                self.db_session,
                gpu_available=self._recommendation_gpu_available,
            )

        return self._recommendation_service


# Factory function for creating service containers
def create_service_container(db_session: Session) -> ServiceContainer:
    """Create a service container with the given database session.

    Args:
        db_session: Database session
        
    Returns:
        ServiceContainer instance

    """
    delivery_repository = DeliveryJobRepository(db_session)
    analytics_repository = AnalyticsRepository(db_session)
    queue_orchestrator = create_queue_orchestrator()

    return ServiceContainer(
        db_session,
        queue_orchestrator=queue_orchestrator,
        delivery_repository=delivery_repository,
        analytics_repository=analytics_repository,
        recommendation_gpu_available=_get_recommendation_gpu_available(),
    )


# Legacy compatibility functions for existing code
def get_adapter_service(db_session: Session) -> AdapterService:
    """Get an adapter service instance (legacy compatibility).

    Args:
        db_session: Database session

    Returns:
        AdapterService instance

    """
    storage_service = make_storage_service()
    return make_adapter_service(db_session=db_session, storage_service=storage_service)


def get_delivery_service(db_session: Session) -> DeliveryService:
    """Get a delivery service instance (legacy compatibility).

    Args:
        db_session: Database session

    Returns:
        DeliveryService instance

    """
    repository = DeliveryJobRepository(db_session)
    queue_orchestrator = create_queue_orchestrator()
    return make_delivery_service(
        repository,
        queue_orchestrator=queue_orchestrator,
    )


def get_compose_service() -> ComposeService:
    """Get a compose service instance (legacy compatibility).

    Returns:
        ComposeService instance

    """
    return make_compose_service()


def get_generation_service() -> GenerationService:
    """Get a generation service instance (legacy compatibility).

    Returns:
        GenerationService instance

    """
    return make_generation_service()


# Legacy compatibility function for importer
def upsert_adapter_from_payload(payload):
    """Upsert an adapter from payload (legacy compatibility).
    
    This provides compatibility for the importer module.
    
    Args:
        payload: AdapterCreate instance or dict
        
    Returns:
        Adapter instance

    """
    from backend.core.database import get_session
    from backend.models import Adapter
    from backend.schemas import AdapterCreate
    
    # Convert dict to AdapterCreate if needed
    if isinstance(payload, dict):
        payload = AdapterCreate(**payload)
    
    # Use the same pattern as the legacy function
    with get_session_context() as session:
        container = create_service_container(session)
        return container.adapters.upsert_adapter(payload)


# Export everything for package-level access
__all__ = [
    'ServiceContainer',
    'create_service_container',
    'AdapterService',
    'AnalyticsService',
    'DeliveryService',
    'DeliveryJobRepository',
    'ComposeService',
    'GenerationService',
    'StorageService',
    'QueueOrchestrator',
    'get_adapter_service',
    'get_delivery_service',
    'get_compose_service',
    'get_generation_service',
    'get_session',
    'file_exists',
    'upsert_adapter_from_payload',
]
