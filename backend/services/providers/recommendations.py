"""Recommendation service provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from sqlmodel import Session

from ..recommendations import (
    EmbeddingCoordinator,
    EmbeddingManager,
    EmbeddingStack,
    FeedbackManager,
    LoRAEmbeddingRepository,
    PersistenceComponents,
    PromptRecommendationUseCase,
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
    UseCaseBundle,
    build_embedding_stack,
    build_persistence_components,
    build_use_cases,
)


class RecommendationServiceFactory(Protocol):
    """Callable protocol for creating :class:`RecommendationService` instances."""

    def __call__(
        self,
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
        ...


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


@dataclass(frozen=True)
class RecommendationProviders:
    """Grouped recommendation-related provider callables."""

    recommendation: RecommendationServiceFactory = make_recommendation_service


__all__ = [
    "RecommendationProviders",
    "RecommendationServiceFactory",
    "make_recommendation_service",
]

