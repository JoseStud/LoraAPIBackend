from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.adapters.service import AdapterService
from backend.services.archive import ArchiveService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.providers import (
    make_adapter_service,
    make_analytics_service,
    make_archive_service,
    make_compose_service,
    make_delivery_service,
    make_generation_coordinator,
    make_generation_service,
    make_recommendation_service,
    make_storage_service,
    make_system_service,
    make_websocket_service,
)
from backend.services.queue import QueueOrchestrator
from backend.services.recommendations import RecommendationServiceBuilder
from backend.services.storage import StorageService
from backend.services.system import SystemService
from backend.services.websocket import WebSocketService


class DummyRepository(DeliveryJobRepository):
    def __init__(self):
        self.created_jobs = []

    def create_job(self, prompt, mode, params):  # type: ignore[override]
        job = SimpleNamespace(id="job", prompt=prompt, mode=mode, params=params)
        self.created_jobs.append(job)
        return job


def test_make_storage_service_uses_provided_backend():
    backend = MagicMock()
    service = make_storage_service(backend=backend)
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


def test_make_archive_service_injects_planner_and_executor():
    adapter_service = MagicMock()
    storage_service = MagicMock()
    planner = MagicMock()
    executor = MagicMock()

    service = make_archive_service(
        adapter_service,
        storage_service,
        planner=planner,
        executor=executor,
    )

    assert isinstance(service, ArchiveService)
    assert service.planner is planner
    assert service.executor is executor


def test_make_delivery_service_assigns_orchestrator():
    repository = DummyRepository()
    orchestrator = MagicMock(spec=QueueOrchestrator)

    service = make_delivery_service(repository, queue_orchestrator=orchestrator)

    assert isinstance(service, DeliveryService)
    assert service.repository is repository
    assert service.queue_orchestrator is orchestrator


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


def test_make_analytics_service_respects_injected_builder():
    session = MagicMock()
    repository = MagicMock()
    time_series_builder = MagicMock()
    insight_generator = MagicMock()

    service = make_analytics_service(
        session,
        repository=repository,
        time_series_builder=time_series_builder,
        insight_generator=insight_generator,
    )

    assert service.db_session is session
    assert service.repository is repository
    assert service.time_series_builder is time_series_builder
    assert service.insight_generator is insight_generator


def test_make_recommendation_service_uses_custom_components():
    session = MagicMock()
    bootstrap = MagicMock()
    bootstrap.device = "cpu"
    bootstrap.gpu_enabled = False
    model_registry = MagicMock()
    bootstrap.get_model_registry.return_value = model_registry

    embedding_repository = MagicMock()
    embedding_manager = MagicMock()
    repository = MagicMock()
    persistence_manager = MagicMock()
    persistence_service = MagicMock()
    metrics_tracker = MagicMock()
    config = MagicMock()
    similar_use_case = MagicMock()
    prompt_use_case = MagicMock()
    embedding_coordinator = MagicMock()
    feedback_manager = MagicMock()
    stats_reporter = MagicMock()
    builder = MagicMock(spec=RecommendationServiceBuilder)
    builder.with_components.return_value = builder
    built_service = MagicMock()
    builder.build.return_value = built_service

    service = make_recommendation_service(
        session,
        gpu_available=True,
        model_bootstrap=bootstrap,
        embedding_repository=embedding_repository,
        embedding_manager=embedding_manager,
        repository=repository,
        persistence_manager=persistence_manager,
        persistence_service=persistence_service,
        metrics_tracker=metrics_tracker,
        config=config,
        similar_use_case=similar_use_case,
        prompt_use_case=prompt_use_case,
        embedding_coordinator=embedding_coordinator,
        feedback_manager=feedback_manager,
        stats_reporter=stats_reporter,
        builder=builder,
    )

    builder.with_components.assert_called_once_with(
        embedding_coordinator=embedding_coordinator,
        feedback_manager=feedback_manager,
        stats_reporter=stats_reporter,
        similar_lora_use_case=similar_use_case,
        prompt_recommendation_use_case=prompt_use_case,
        config=config,
    )
    builder.build.assert_called_once_with()
    assert service is built_service
