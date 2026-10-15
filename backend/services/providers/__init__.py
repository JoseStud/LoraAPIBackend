"""Typed service provider interfaces grouped by domain."""

from .analytics import (
    AnalyticsServiceFactory,
    make_analytics_service,
)
from .archive import ArchiveServiceFactory, make_archive_service
from .deliveries import (
    DeliveryServiceFactory,
    make_delivery_service,
)
from .generation import (
    ComposeServiceFactory,
    GenerationCoordinatorFactory,
    GenerationServiceFactory,
    make_compose_service,
    make_generation_coordinator,
    make_generation_service,
)
from .recommendations import (
    RecommendationServiceFactory,
    make_recommendation_service,
)
from .storage import (
    AdapterServiceFactory,
    StorageServiceFactory,
    make_adapter_service,
    make_storage_service,
)
from .system import SystemServiceFactory, make_system_service
from .websocket import (
    WebSocketServiceFactory,
    default_websocket_service_factory,
    make_websocket_service,
)

__all__ = [
    "AdapterServiceFactory",
    "AnalyticsServiceFactory",
    "ArchiveServiceFactory",
    "ComposeServiceFactory",
    "DeliveryServiceFactory",
    "GenerationCoordinatorFactory",
    "GenerationServiceFactory",
    "RecommendationServiceFactory",
    "StorageServiceFactory",
    "SystemServiceFactory",
    "WebSocketServiceFactory",
    "default_websocket_service_factory",
    "make_adapter_service",
    "make_analytics_service",
    "make_archive_service",
    "make_compose_service",
    "make_delivery_service",
    "make_generation_coordinator",
    "make_generation_service",
    "make_recommendation_service",
    "make_storage_service",
    "make_system_service",
    "make_websocket_service",
]
