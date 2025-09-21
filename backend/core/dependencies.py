"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import ServiceContainer
from backend.services.adapters import AdapterService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.archive import ArchiveService
from backend.services.recommendations import RecommendationService


def get_service_container(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> ServiceContainer:
    """Return a service container tied to the current database session."""

    return ServiceContainer(db_session)


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
    container = ServiceContainer(db_session=None)  # ComposeService doesn't need DB
    return container.compose


def _is_gpu_available() -> bool:
    """Proxy GPU availability check to the recommendation service helper."""
    return RecommendationService.is_gpu_available()


def get_recommendation_service(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> RecommendationService:
    """Return a RecommendationService instance."""
    gpu_enabled = _is_gpu_available()
    return RecommendationService(db_session=db_session, gpu_enabled=gpu_enabled)


def get_archive_service(
    container: ServiceContainer = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> ArchiveService:
    """Return the archive helper service."""

    return container.archive
