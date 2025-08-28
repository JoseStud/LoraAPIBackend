"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from db import get_session
from services import AdapterService, ComposeService, DeliveryService


def get_adapter_service(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> AdapterService:
    """Return an AdapterService instance."""
    return AdapterService(db_session)


def get_delivery_service(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> DeliveryService:
    """Return a DeliveryService instance."""
    return DeliveryService(db_session)


def get_compose_service() -> ComposeService:
    """Get an instance of the ComposeService."""
    return ComposeService()
