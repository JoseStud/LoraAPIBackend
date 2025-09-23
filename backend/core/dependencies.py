"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import ServiceRegistry, get_service_container_builder
from backend.services.adapters import AdapterService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.archive import ArchiveService, BackupService
from backend.services.recommendations import RecommendationService

_BUILDER = get_service_container_builder()


def get_service_container(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> ServiceRegistry:
    """Return a service registry tied to the current database session."""

    return _BUILDER.build(db_session)


def get_adapter_service(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> AdapterService:
    """Return an AdapterService instance."""
    return container.adapters


def get_delivery_service(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> DeliveryService:
    """Return a DeliveryService instance."""
    return container.deliveries


def get_compose_service() -> ComposeService:
    """Get an instance of the ComposeService."""
    return _BUILDER.build(None).compose


def get_recommendation_service(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> RecommendationService:
    """Return a RecommendationService instance."""
    return container.recommendations


def get_archive_service(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> ArchiveService:
    """Return the archive helper service."""

    return container.archive


def get_backup_service(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> BackupService:
    """Return the backup service instance."""

    return container.backups
