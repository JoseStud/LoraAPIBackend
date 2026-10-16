from dataclasses import replace
from unittest.mock import MagicMock

from backend.models import LoRAEmbedding
from backend.services import get_service_container_builder
from backend.services.adapters.service import AdapterService
from backend.services.analytics import AnalyticsService
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.archive import ArchiveService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.providers.generation import (
    make_compose_service,
    make_generation_coordinator,
    make_generation_service,
)
from backend.services.providers.websocket import make_websocket_service
from backend.services.queue import QueueOrchestrator
from backend.services.recommendations import EmbeddingService, RecommendationService
from backend.services.service_registry import (
    make_adapter_service,
    make_recommendation_service,
    make_storage_service,
    make_system_service,
)
from backend.services.storage import StorageService
from backend.services.system import SystemService
from backend.services.websocket import WebSocketService


def test_make_storage_service_uses_configured_backend(monkeypatch):
    backend = MagicMock()
    monkeypatch.setattr(
        "backend.services.service_registry.get_storage_backend", lambda: backend
    )
    service = make_storage_service()
    assert isinstance(service, StorageService)
    assert service.backend is backend


def test_make_adapter_service_respects_storage_backend():
    session = MagicMock()
    storage_backend = MagicMock()
    storage_service = StorageService(storage_backend)

    service = make_adapter_service(
        db_session=session,
        storage_service=storage_service,
    )

    assert isinstance(service, AdapterService)
    assert service.db_session is session
    assert service.storage_backend is storage_backend


def test_make_compose_service_returns_instance():
    assert isinstance(make_compose_service(), ComposeService)


def test_make_generation_service_returns_instance():
    assert isinstance(make_generation_service(), GenerationService)


def test_make_generation_coordinator_uses_dependencies():
    deliveries = MagicMock()
    websocket = MagicMock(spec=WebSocketService)
    generation = MagicMock(spec=GenerationService)

    coordinator = make_generation_coordinator(deliveries, websocket, generation)

    assert isinstance(coordinator, GenerationCoordinator)
    assert coordinator._deliveries is deliveries
    assert coordinator._websocket is websocket
    assert coordinator._generation_service is generation


def test_make_websocket_service_returns_existing_instance():
    instance = WebSocketService()
    assert make_websocket_service(service=instance) is instance


def test_make_system_service_wires_delivery_service():
    deliveries = MagicMock(spec=DeliveryService)
    system_service = make_system_service(deliveries)
    assert isinstance(system_service, SystemService)
    assert system_service._delivery_service is deliveries


def test_make_recommendation_service_binds_session_and_gpu_flag():
    session = MagicMock()

    service = make_recommendation_service(session, gpu_available=False)

    assert isinstance(service, RecommendationService)
    assert isinstance(service.embeddings, EmbeddingService)
    assert service.device == "cpu"
    assert service.gpu_enabled is False

    service.embedding_status("adapter-1")
    session.get.assert_called_once_with(LoRAEmbedding, "adapter-1")


def test_service_container_uses_custom_providers(db_session):
    queue_orchestrator = MagicMock(spec=QueueOrchestrator)
    delivery_repository = MagicMock(spec=DeliveryJobRepository)
    analytics_repository = MagicMock(spec=AnalyticsRepository)

    storage_service = MagicMock(spec=StorageService)
    storage_provider = MagicMock(return_value=storage_service)
    adapter_service = MagicMock(spec=AdapterService)
    adapter_provider = MagicMock(return_value=adapter_service)

    compose_service = MagicMock(spec=ComposeService)
    compose_provider = MagicMock(return_value=compose_service)
    generation_service = MagicMock(spec=GenerationService)
    generation_provider = MagicMock(return_value=generation_service)
    analytics_service = MagicMock(spec=AnalyticsService)
    analytics_provider = MagicMock(return_value=analytics_service)
    recommendation_service = MagicMock(spec=RecommendationService)
    recommendation_provider = MagicMock(return_value=recommendation_service)

    archive_service = MagicMock(spec=ArchiveService)
    archive_provider = MagicMock(return_value=archive_service)
    delivery_service = MagicMock(spec=DeliveryService)
    delivery_provider = MagicMock(return_value=delivery_service)
    websocket_service = MagicMock(spec=WebSocketService)
    websocket_provider = MagicMock(return_value=websocket_service)
    system_service = MagicMock(spec=SystemService)
    system_provider = MagicMock(return_value=system_service)
    generation_coordinator = MagicMock(spec=GenerationCoordinator)
    generation_coordinator_provider = MagicMock(return_value=generation_coordinator)

    builder = get_service_container_builder().with_overrides(
        factories=lambda factories: replace(
            factories,
            storage=storage_provider,
            adapter=adapter_provider,
            compose=compose_provider,
            generation=generation_provider,
            analytics=analytics_provider,
            recommendation=recommendation_provider,
            archive=archive_provider,
            delivery=delivery_provider,
            generation_coordinator=generation_coordinator_provider,
            websocket=websocket_provider,
            system=system_provider,
        ),
    )
    registry = builder.build(
        db_session,
        queue_orchestrator=queue_orchestrator,
        delivery_repository=delivery_repository,
        analytics_repository=analytics_repository,
        recommendation_gpu_available=True,
    )

    assert registry.storage is storage_service
    storage_provider.assert_called_once_with()

    assert registry.adapters is adapter_service
    adapter_provider.assert_called_once_with(
        db_session=db_session,
        storage_service=storage_service,
    )

    assert registry.compose is compose_service
    compose_provider.assert_called_once_with()

    assert registry.generation is generation_service
    generation_provider.assert_called_once_with()

    assert registry.analytics is analytics_service
    analytics_provider.assert_called_once_with(
        db_session,
        repository=analytics_repository,
    )

    assert registry.recommendations is recommendation_service
    recommendation_provider.assert_called_once_with(
        db_session,
        gpu_available=True,
    )

    assert registry.archive is archive_service
    archive_provider.assert_called_once_with(adapter_service, storage_service)

    assert registry.deliveries is delivery_service
    delivery_provider.assert_called_once_with(
        delivery_repository,
        queue_orchestrator=queue_orchestrator,
    )

    assert registry.websocket is websocket_service
    websocket_provider.assert_called_once_with()

    assert registry.system is system_service
    system_provider.assert_called_once_with(delivery_service)

    assert registry.generation_coordinator is generation_coordinator
    generation_coordinator_provider.assert_called_once_with(
        delivery_service,
        websocket_service,
        generation_service,
    )
