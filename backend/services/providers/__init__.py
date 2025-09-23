"""Factory helpers for constructing service instances with explicit dependencies."""

from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from backend.services.adapters import AdapterService
from backend.services.analytics import AnalyticsService, InsightGenerator, TimeSeriesBuilder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.archive import ArchiveExportPlanner, ArchiveImportExecutor, ArchiveService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.queue import QueueOrchestrator
from backend.services.recommendations import (
    EmbeddingCoordinator,
    EmbeddingManager,
    EmbeddingStack,
    FeedbackManager,
    LoRAEmbeddingRepository,
    PersistenceComponents,
    RecommendationConfig,
    RecommendationMetricsTracker,
    RecommendationModelBootstrap,
    RecommendationPersistenceManager,
    RecommendationPersistenceService,
    RecommendationRepository,
    RecommendationService,
    RecommendationServiceBuilder,
    SimilarLoraUseCase,
    StatsReporter,
    PromptRecommendationUseCase,
    UseCaseBundle,
    build_embedding_stack,
    build_persistence_components,
    build_use_cases,
)
from backend.services.storage import StorageBackend, StorageService, get_storage_backend
from backend.services.system import SystemService
from backend.services.websocket import WebSocketService


def make_storage_service(*, backend: Optional[StorageBackend] = None) -> StorageService:
    """Create a :class:`StorageService` using the provided backend."""

    backend = backend or get_storage_backend()
    return StorageService(backend)


def make_adapter_service(
    *,
    db_session: Session,
    storage_service: StorageService,
    storage_backend: Optional[StorageBackend] = None,
) -> AdapterService:
    """Create an :class:`AdapterService` with explicit collaborators."""

    backend = storage_backend or storage_service.backend
    return AdapterService(db_session, storage_backend=backend)


def make_archive_service(
    adapter_service: AdapterService,
    storage_service: StorageService,
    *,
    planner: Optional[ArchiveExportPlanner] = None,
    executor: Optional[ArchiveImportExecutor] = None,
    chunk_size: int = 64 * 1024,
    spooled_file_max_size: int = 32 * 1024 * 1024,
) -> ArchiveService:
    """Create an :class:`ArchiveService` wired with planner and executor collaborators."""

    return ArchiveService(
        adapter_service,
        storage_service,
        planner=planner,
        executor=executor,
        chunk_size=chunk_size,
        spooled_file_max_size=spooled_file_max_size,
    )


def make_delivery_service(
    repository: DeliveryJobRepository,
    *,
    queue_orchestrator: QueueOrchestrator,
) -> DeliveryService:
    """Create a :class:`DeliveryService` with explicit repository and queue orchestrator."""

    return DeliveryService(repository, queue_orchestrator=queue_orchestrator)


def make_compose_service() -> ComposeService:
    """Create a :class:`ComposeService`."""

    return ComposeService()


def make_generation_service() -> GenerationService:
    """Create a :class:`GenerationService`."""

    return GenerationService()


def make_generation_coordinator(
    delivery_service: DeliveryService,
    websocket_service: WebSocketService,
    generation_service: GenerationService,
) -> GenerationCoordinator:
    """Create a :class:`GenerationCoordinator` with its collaborators."""

    return GenerationCoordinator(delivery_service, websocket_service, generation_service)


def make_websocket_service(
    *,
    service: Optional[WebSocketService] = None,
    connection_manager=None,
    job_monitor=None,
) -> WebSocketService:
    """Create or return a :class:`WebSocketService` configured with explicit collaborators."""

    if service is not None:
        return service
    return WebSocketService(connection_manager=connection_manager, job_monitor=job_monitor)


def make_system_service(delivery_service: DeliveryService) -> SystemService:
    """Create a :class:`SystemService` bound to the delivery service."""

    return SystemService(delivery_service)


def make_analytics_service(
    db_session: Session,
    *,
    repository: AnalyticsRepository,
    time_series_builder: Optional[TimeSeriesBuilder] = None,
    insight_generator: Optional[InsightGenerator] = None,
) -> AnalyticsService:
    """Create an :class:`AnalyticsService` with explicit collaborators."""

    return AnalyticsService(
        db_session,
        repository=repository,
        time_series_builder=time_series_builder or TimeSeriesBuilder(),
        insight_generator=insight_generator or InsightGenerator(),
    )


def make_recommendation_service(
    db_session: Session,
    *,
    gpu_available: bool,
    model_bootstrap: Optional[RecommendationModelBootstrap] = None,
    embedding_repository: Optional[LoRAEmbeddingRepository] = None,
    embedding_manager: Optional[EmbeddingManager] = None,
    embedding_stack: Optional[EmbeddingStack] = None,
    repository: Optional[RecommendationRepository] = None,
    persistence_manager: Optional[RecommendationPersistenceManager] = None,
    persistence_service: Optional[RecommendationPersistenceService] = None,
    persistence_components: Optional[PersistenceComponents] = None,
    metrics_tracker: Optional[RecommendationMetricsTracker] = None,
    config: Optional[RecommendationConfig] = None,
    similar_use_case: Optional[SimilarLoraUseCase] = None,
    prompt_use_case: Optional[PromptRecommendationUseCase] = None,
    use_case_bundle: Optional[UseCaseBundle] = None,
    embedding_coordinator: Optional[EmbeddingCoordinator] = None,
    feedback_manager: Optional[FeedbackManager] = None,
    stats_reporter: Optional[StatsReporter] = None,
    builder: Optional[RecommendationServiceBuilder] = None,
) -> RecommendationService:
    """Create a :class:`RecommendationService` wired with explicit collaborators."""

    bootstrap = model_bootstrap or RecommendationModelBootstrap(gpu_enabled=gpu_available)
    model_registry = bootstrap.get_model_registry()

    repository = repository or RecommendationRepository(db_session)

    if embedding_stack is None:
        embedding_stack = build_embedding_stack(
            db_session=db_session,
            model_registry=model_registry,
            embedding_repository=embedding_repository,
            embedding_manager=embedding_manager,
        )
    embedding_repository = embedding_stack.repository
    embedding_manager = embedding_stack.manager

    if persistence_components is None:
        persistence_components = build_persistence_components(
            embedding_manager=embedding_manager,
            model_registry=model_registry,
            persistence_manager=persistence_manager,
            persistence_service=persistence_service,
            config=config,
        )
    persistence_manager = persistence_components.manager
    persistence_service = persistence_components.service
    config = persistence_components.config

    metrics_tracker = metrics_tracker or RecommendationMetricsTracker()

    if use_case_bundle is None:
        use_case_bundle = build_use_cases(
            repository=repository,
            embedding_workflow=embedding_manager,
            model_registry=model_registry,
            metrics_tracker=metrics_tracker,
            device=bootstrap.device,
            similar_use_case=similar_use_case,
            prompt_use_case=prompt_use_case,
        )
    similar_use_case = use_case_bundle.similar_lora
    prompt_use_case = use_case_bundle.prompt_recommendation

    embedding_coordinator = embedding_coordinator or EmbeddingCoordinator(
        bootstrap=bootstrap,
        embedding_workflow=embedding_manager,
        persistence_service=persistence_service,
    )
    feedback_manager = feedback_manager or FeedbackManager(repository)
    stats_reporter = stats_reporter or StatsReporter(
        metrics_tracker=metrics_tracker,
        repository=repository,
    )

    builder = builder or RecommendationServiceBuilder()
    return (
        builder.with_components(
            embedding_coordinator=embedding_coordinator,
            feedback_manager=feedback_manager,
            stats_reporter=stats_reporter,
            similar_lora_use_case=similar_use_case,
            prompt_recommendation_use_case=prompt_use_case,
            config=config,
        ).build()
    )


__all__ = [
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
