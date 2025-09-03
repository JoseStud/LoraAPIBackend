"""Dependencies for service injection."""

from fastapi import Depends
from sqlmodel import Session

from backend.core.database import get_session
from backend.services import ServiceContainer
from backend.services.adapters import AdapterService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.recommendations import RecommendationService


def get_adapter_service(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> AdapterService:
    """Return an AdapterService instance."""
    container = ServiceContainer(db_session)
    return container.adapters


def get_delivery_service(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> DeliveryService:
    """Return a DeliveryService instance."""
    container = ServiceContainer(db_session)
    return container.deliveries


def get_compose_service() -> ComposeService:
    """Get an instance of the ComposeService."""
    container = ServiceContainer(db_session=None)  # ComposeService doesn't need DB
    return container.compose


def _is_gpu_available() -> bool:
    """Check if GPU is available (supports CUDA, ROCm, and MPS)."""
    try:
        import torch
        if torch.cuda.is_available():
            return True
        elif hasattr(torch.version, 'hip') and torch.version.hip is not None:
            # ROCm/HIP support for AMD GPUs
            return True
        elif torch.backends.mps.is_available():
            # Apple Silicon GPU support
            return True
        return False
    except ImportError:
        return False


def get_recommendation_service(
    db_session: Session = Depends(get_session),  # noqa: B008 - FastAPI DI
) -> RecommendationService:
    """Return a RecommendationService instance."""
    gpu_enabled = _is_gpu_available()
    return RecommendationService(db_session=db_session, gpu_enabled=gpu_enabled)
