"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import (
    ApplicationServices,
    CoreServices,
    DomainServices,
    ServiceRegistry,
    get_service_container_builder,
)

_BUILDER = get_service_container_builder()


def get_service_container(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> ServiceRegistry:
    """Return a service registry tied to the current database session."""

    return _BUILDER.build(db_session)


def get_core_services(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> CoreServices:
    """Return the core service facade."""

    return container.core


def get_domain_services(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> DomainServices:
    """Return the domain service facade."""

    return container.domain


def get_application_services(
    container: ServiceRegistry = Depends(get_service_container),  # noqa: B008 - FastAPI DI
) -> ApplicationServices:
    """Return the application service facade."""

    return container.application
