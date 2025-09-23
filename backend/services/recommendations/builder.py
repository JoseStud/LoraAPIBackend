"""Builder utilities for assembling :class:`RecommendationService`."""

from __future__ import annotations

import logging
from typing import Optional

from .config import RecommendationConfig
from .embedding_coordinator import EmbeddingCoordinator
from .feedback_manager import FeedbackManager
from .interfaces import (
    EmbeddingWorkflow,
    RecommendationBootstrap,
    RecommendationMetricsTracker as RecommendationMetricsTrackerProtocol,
    RecommendationPersistenceService,
    RecommendationRepository,
)
from .metrics import RecommendationMetricsTracker
from .service import RecommendationService
from .stats_reporter import StatsReporter
from .use_cases import PromptRecommendationUseCase, SimilarLoraUseCase


class RecommendationServiceBuilder:
    """Fluent builder for :class:`RecommendationService`."""

    def __init__(self) -> None:
        self._embedding_coordinator: Optional[EmbeddingCoordinator] = None
        self._feedback_manager: Optional[FeedbackManager] = None
        self._stats_reporter: Optional[StatsReporter] = None
        self._similar_use_case: Optional[SimilarLoraUseCase] = None
        self._prompt_use_case: Optional[PromptRecommendationUseCase] = None
        self._config: Optional[RecommendationConfig] = None
        self._logger: Optional[logging.Logger] = None

    # ------------------------------------------------------------------
    # Fluent configuration helpers
    # ------------------------------------------------------------------
    def with_components(
        self,
        *,
        embedding_coordinator: EmbeddingCoordinator,
        feedback_manager: FeedbackManager,
        stats_reporter: StatsReporter,
        similar_lora_use_case: SimilarLoraUseCase,
        prompt_recommendation_use_case: PromptRecommendationUseCase,
        config: RecommendationConfig,
    ) -> "RecommendationServiceBuilder":
        """Set all collaborators explicitly."""

        self._embedding_coordinator = embedding_coordinator
        self._feedback_manager = feedback_manager
        self._stats_reporter = stats_reporter
        self._similar_use_case = similar_lora_use_case
        self._prompt_use_case = prompt_recommendation_use_case
        self._config = config
        return self

    def with_logger(self, logger: logging.Logger) -> "RecommendationServiceBuilder":
        """Override the logger used by the service facade."""

        self._logger = logger
        return self

    def with_legacy_dependencies(
        self,
        *,
        bootstrap: RecommendationBootstrap,
        repository: RecommendationRepository,
        embedding_workflow: EmbeddingWorkflow,
        persistence_service: RecommendationPersistenceService,
        metrics_tracker: Optional[RecommendationMetricsTrackerProtocol] = None,
        logger: Optional[logging.Logger] = None,
    ) -> "RecommendationServiceBuilder":
        """Populate collaborators from the legacy dependency set."""

        metrics = metrics_tracker or RecommendationMetricsTracker()
        model_registry = bootstrap.get_model_registry()

        embedding_coordinator = EmbeddingCoordinator(
            bootstrap=bootstrap,
            embedding_workflow=embedding_workflow,
            persistence_service=persistence_service,
            logger=logger,
        )
        feedback_manager = FeedbackManager(repository)
        stats_reporter = StatsReporter(
            metrics_tracker=metrics,
            repository=repository,
        )
        similar_use_case = SimilarLoraUseCase(
            repository=repository,
            embedding_workflow=embedding_workflow,
            engine_provider=model_registry.get_recommendation_engine,
            metrics=metrics,
        )
        prompt_use_case = PromptRecommendationUseCase(
            repository=repository,
            embedder_provider=model_registry.get_semantic_embedder,
            metrics=metrics,
            device=bootstrap.device,
        )
        config = RecommendationConfig(persistence_service)

        return self.with_components(
            embedding_coordinator=embedding_coordinator,
            feedback_manager=feedback_manager,
            stats_reporter=stats_reporter,
            similar_lora_use_case=similar_use_case,
            prompt_recommendation_use_case=prompt_use_case,
            config=config,
        )

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------
    def build(self) -> RecommendationService:
        """Construct a :class:`RecommendationService` instance."""

        if self._embedding_coordinator is None:
            raise ValueError("embedding_coordinator must be provided before build()")
        if self._feedback_manager is None:
            raise ValueError("feedback_manager must be provided before build()")
        if self._stats_reporter is None:
            raise ValueError("stats_reporter must be provided before build()")
        if self._similar_use_case is None:
            raise ValueError("similar_lora_use_case must be provided before build()")
        if self._prompt_use_case is None:
            raise ValueError("prompt_recommendation_use_case must be provided before build()")
        if self._config is None:
            raise ValueError("config must be provided before build()")

        return RecommendationService(
            embedding_coordinator=self._embedding_coordinator,
            feedback_manager=self._feedback_manager,
            stats_reporter=self._stats_reporter,
            similar_lora_use_case=self._similar_use_case,
            prompt_recommendation_use_case=self._prompt_use_case,
            config=self._config,
            logger=self._logger,
        )
