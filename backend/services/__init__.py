"""Service layer initialization and dependency injection."""

from typing import Optional

from sqlmodel import Session

# Import file_exists for test compatibility - use root level for backward compatibility
from backend.services.storage import get_storage_service

from .adapters import AdapterService
from .analytics import AnalyticsService
from .archive import ArchiveExportPlanner, ArchiveImportExecutor, ArchiveService
from .composition import ComposeService
from .deliveries import DeliveryService
from .generation import GenerationCoordinator, GenerationService
from .queue import QueueBackend, get_queue_backends
from .storage import StorageService
from .system import SystemService
from .websocket import WebSocketService, websocket_service


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
        queue_backend: Optional[QueueBackend] = None,
        fallback_queue_backend: Optional[QueueBackend] = None,
    ):
        """Initialize service container.

        Args:
            db_session: Database session for services that need it

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
        self._queue_backend = queue_backend
        self._fallback_queue_backend = fallback_queue_backend
    
    @property
    def storage(self) -> StorageService:
        """Get storage service instance."""
        if self._storage_service is None:
            self._storage_service = get_storage_service()
        return self._storage_service
    
    @property
    def adapters(self) -> AdapterService:
        """Get adapter service instance."""
        if self._adapter_service is None:
            self._adapter_service = AdapterService(
                self.db_session,
                self.storage.backend,
            )
        return self._adapter_service

    @property
    def archive(self) -> ArchiveService:
        """Get archive service instance."""

        if self._archive_service is None:
            adapter_service = self.adapters
            storage_service = self.storage
            planner = ArchiveExportPlanner(adapter_service, storage_service)
            executor = ArchiveImportExecutor(adapter_service)
            self._archive_service = ArchiveService(
                adapter_service,
                storage_service,
                planner=planner,
                executor=executor,
            )
        return self._archive_service
    
    @property
    def deliveries(self) -> DeliveryService:
        """Get delivery service instance."""
        if self.db_session is None:
            raise ValueError("DeliveryService requires an active database session")

        if self._delivery_service is None:
            primary_queue = self._queue_backend
            fallback_queue = self._fallback_queue_backend

            if primary_queue is None or fallback_queue is None:
                default_primary, default_fallback = get_queue_backends()
                if primary_queue is None:
                    primary_queue = default_primary
                if fallback_queue is None:
                    fallback_queue = default_fallback

            self._delivery_service = DeliveryService(
                self.db_session,
                queue_backend=primary_queue,
                fallback_queue_backend=fallback_queue,
            )
        return self._delivery_service
    
    @property
    def compose(self) -> ComposeService:
        """Get compose service instance."""
        if self._compose_service is None:
            self._compose_service = ComposeService()
        return self._compose_service
    
    @property
    def generation(self) -> GenerationService:
        """Get generation service instance."""
        if self._generation_service is None:
            self._generation_service = GenerationService()
        return self._generation_service

    @property
    def generation_coordinator(self) -> GenerationCoordinator:
        """Get generation coordinator helper."""

        if self._generation_coordinator is None:
            self._generation_coordinator = GenerationCoordinator(
                self.deliveries,
                self.websocket,
                self.generation,
            )
        return self._generation_coordinator

    @property
    def websocket(self) -> WebSocketService:
        """Get WebSocket service instance."""
        if self._websocket_service is None:
            self._websocket_service = websocket_service
        return self._websocket_service

    @property
    def system(self) -> SystemService:
        """Get system monitoring service instance."""

        if self._system_service is None:
            self._system_service = SystemService(self.deliveries)
        return self._system_service

    @property
    def analytics(self) -> AnalyticsService:
        """Get analytics service instance."""

        if self.db_session is None:
            raise ValueError("AnalyticsService requires an active database session")

        if self._analytics_service is None:
            self._analytics_service = AnalyticsService(self.db_session)
        return self._analytics_service


# Factory function for creating service containers
def create_service_container(db_session: Session) -> ServiceContainer:
    """Create a service container with the given database session.
    
    Args:
        db_session: Database session
        
    Returns:
        ServiceContainer instance

    """
    return ServiceContainer(db_session)


# Legacy compatibility functions for existing code
def get_adapter_service(db_session: Session) -> AdapterService:
    """Get an adapter service instance (legacy compatibility).
    
    Args:
        db_session: Database session
        
    Returns:
        AdapterService instance

    """
    container = create_service_container(db_session)
    return container.adapters


def get_delivery_service(db_session: Session) -> DeliveryService:
    """Get a delivery service instance (legacy compatibility).
    
    Args:
        db_session: Database session
        
    Returns:
        DeliveryService instance

    """
    container = create_service_container(db_session)
    return container.deliveries


def get_compose_service() -> ComposeService:
    """Get a compose service instance (legacy compatibility).
    
    Returns:
        ComposeService instance

    """
    return ComposeService()


def get_generation_service() -> GenerationService:
    """Get a generation service instance (legacy compatibility).
    
    Returns:
        GenerationService instance

    """
    return GenerationService()


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
        container = ServiceContainer(session)
        return container.adapters.upsert_adapter(payload)


# Export everything for package-level access
__all__ = [
    'ServiceContainer',
    'create_service_container',
    'AdapterService',
    'AnalyticsService',
    'DeliveryService',
    'ComposeService',
    'GenerationService',
    'StorageService',
    'get_adapter_service',
    'get_delivery_service',
    'get_compose_service',
    'get_generation_service',
    'get_session',
    'file_exists',
    'upsert_adapter_from_payload',
]
