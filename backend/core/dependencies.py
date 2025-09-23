"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import ServiceContainer
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import QueueOrchestrator, create_queue_orchestrator
from backend.services.adapters import AdapterService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.archive import ArchiveService
from backend.services.recommendations import RecommendationService
from backend.services.providers import make_compose_service

_QUEUE_ORCHESTRATOR: QueueOrchestrator = create_queue_orchestrator()
_GPU_AVAILABLE: bool = RecommendationService.is_gpu_available()


def get_service_container(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> ServiceContainer:
    """Return a service container tied to the current database session."""

    repository = DeliveryJobRepository(db_session)
    analytics_repository = AnalyticsRepository(db_session)
    return ServiceContainer(
        db_session,
        queue_orchestrator=_QUEUE_ORCHESTRATOR,
        delivery_repository=repository,
        analytics_repository=analytics_repository,
        recommendation_gpu_available=_GPU_AVAILABLE,
    )


def get_adapter_service(
    container: ServiceContainer = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> AdapterService:
    """Return an AdapterService instance."""
    return container.adapters


def get_delivery_service(
    container: ServiceContainer = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> DeliveryService:
    """Return a DeliveryService instance."""
    return container.deliveries


def get_compose_service() -> ComposeService:
    """Get an instance of the ComposeService."""
    return make_compose_service()


def get_recommendation_service(
    container: ServiceContainer = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> RecommendationService:
    """Return a RecommendationService instance."""
    return container.recommendations


def get_archive_service(
    container: ServiceContainer = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> ArchiveService:
    """Return the archive helper service."""

    return container.archive
