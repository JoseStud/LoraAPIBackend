"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import ServiceRegistry, get_service_container_builder


def get_services(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> ServiceRegistry:
    """Return the service registry for the current request's database session."""
    return get_service_container_builder().build(db_session)
