"""Typed service provider interfaces grouped by domain."""

from .analytics import (
    AnalyticsProviders,
    AnalyticsServiceFactory,
    make_analytics_service,
)
from .archive import ArchiveProviders, ArchiveServiceFactory, make_archive_service
from .deliveries import (
    DeliveryProviders,
    DeliveryServiceFactory,
    make_delivery_service,
)
from .generation import (
    ComposeServiceFactory,
    GenerationCoordinatorFactory,
    GenerationProviders,
    GenerationServiceFactory,
    make_compose_service,
    make_generation_coordinator,
    make_generation_service,
)
from .recommendations import (
    RecommendationProviders,
    RecommendationServiceFactory,
    make_recommendation_service,
)
from .storage import (
    AdapterServiceFactory,
    StorageProviders,
    StorageServiceFactory,
    make_adapter_service,
    make_storage_service,
)
from .system import SystemProviders, SystemServiceFactory, make_system_service
from .websocket import (
    WebSocketProviders,
    WebSocketServiceFactory,
    default_websocket_service_factory,
    make_websocket_service,
)

__all__ = [
    "AdapterServiceFactory",
    "AnalyticsProviders",
    "AnalyticsServiceFactory",
    "ArchiveProviders",
    "ArchiveServiceFactory",
    "ComposeServiceFactory",
    "DeliveryProviders",
    "DeliveryServiceFactory",
    "GenerationCoordinatorFactory",
    "GenerationProviders",
    "GenerationServiceFactory",
    "RecommendationProviders",
    "RecommendationServiceFactory",
    "StorageProviders",
    "StorageServiceFactory",
    "SystemProviders",
    "SystemServiceFactory",
    "WebSocketProviders",
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

