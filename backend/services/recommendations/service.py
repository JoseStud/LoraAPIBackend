"""Recommendation service for LoRA adapter discovery and learning."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Sequence

from backend.schemas.recommendations import (
    EmbeddingStatus,
    IndexRebuildResponse,
    RecommendationItem,
    RecommendationStats,
)

from .config import RecommendationConfig
from .embedding_coordinator import EmbeddingCoordinator
from .feedback_manager import FeedbackManager
from .interfaces import (
    EmbeddingWorkflow,
    RecommendationBootstrap,
    RecommendationPersistenceService,
    RecommendationRepository,
)
from .interfaces import (
    RecommendationMetricsTracker as RecommendationMetricsTrackerProtocol,
)
from .stats_reporter import StatsReporter
from .use_cases import (
    PromptRecommendationUseCase,
    SimilarLoraUseCase,
)


class RecommendationService:
    """Slim facade that orchestrates recommendation workflows."""

    def __init__(
        self,
        *,
        embedding_coordinator: EmbeddingCoordinator,
        feedback_manager: FeedbackManager,
        stats_reporter: StatsReporter,
        similar_lora_use_case: SimilarLoraUseCase,
        prompt_recommendation_use_case: PromptRecommendationUseCase,
        config: RecommendationConfig,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)

        self._embedding_coordinator = embedding_coordinator
        self._feedback_manager = feedback_manager
        self._stats_reporter = stats_reporter
        self._similar_lora_use_case = similar_lora_use_case
        self._prompt_recommendation_use_case = prompt_recommendation_use_case
        self._config = config

    @classmethod
    def from_legacy_dependencies(
        cls,
        *,
        bootstrap: RecommendationBootstrap,
        repository: RecommendationRepository,
        embedding_workflow: EmbeddingWorkflow,
        persistence_service: RecommendationPersistenceService,
        metrics_tracker: Optional[RecommendationMetricsTrackerProtocol] = None,
        logger: Optional[logging.Logger] = None,
    ) -> "RecommendationService":
        """Assemble the service from the pre-refactor dependency set."""
        from .builder import RecommendationServiceBuilder

        builder = RecommendationServiceBuilder()
        if logger is not None:
            builder = builder.with_logger(logger)

        return builder.with_legacy_dependencies(
            bootstrap=bootstrap,
            repository=repository,
            embedding_workflow=embedding_workflow,
            persistence_service=persistence_service,
            metrics_tracker=metrics_tracker,
            logger=logger,
        ).build()

    # ------------------------------------------------------------------
    # Static helpers delegating to the embedding coordinator bootstrap
    # ------------------------------------------------------------------
    @staticmethod
    def is_gpu_available() -> bool:
        """Detect GPU availability across CUDA, ROCm, and MPS runtimes."""
        return EmbeddingCoordinator.is_gpu_available()

    @classmethod
    def preload_models(cls, gpu_enabled: Optional[bool] = None) -> None:
        """Eagerly load heavy shared models so the first request is fast."""
        EmbeddingCoordinator.preload_models(gpu_enabled=gpu_enabled)

    @staticmethod
    def models_loaded() -> bool:
        """Return whether required models have already been loaded."""
        return EmbeddingCoordinator.models_loaded()

    # ------------------------------------------------------------------
    # Recommendation workflows
    # ------------------------------------------------------------------
    async def similar_loras(
        self,
        *,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        diversify_results: bool = True,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Return LoRAs similar to the target adapter."""
        return await self._similar_lora_use_case.execute(
            target_lora_id=target_lora_id,
            limit=limit,
            similarity_threshold=similarity_threshold,
            diversify_results=diversify_results,
            weights=weights,
        )

    async def recommend_for_prompt(
        self,
        *,
        prompt: str,
        active_loras: Optional[Sequence[str]] = None,
        limit: int = 10,
        style_preference: Optional[str] = None,
    ) -> List[RecommendationItem]:
        """Return LoRA recommendations that enhance the provided prompt."""
        return await self._prompt_recommendation_use_case.execute(
            prompt=prompt,
            active_loras=list(active_loras) if active_loras is not None else None,
            limit=limit,
            style_preference=style_preference,
        )

    # ------------------------------------------------------------------
    # Embedding workflows
    # ------------------------------------------------------------------
    async def refresh_indexes(self, *, force: bool = False) -> IndexRebuildResponse:
        """Refresh the persisted similarity index."""
        return await self._embedding_coordinator.refresh_similarity_index(force=force)

    # ------------------------------------------------------------------
    # Reporting helpers
    # ------------------------------------------------------------------
    def stats(self) -> RecommendationStats:
        """Return recommendation system statistics."""
        return self._stats_reporter.build_stats(gpu_enabled=self.gpu_enabled)

    def embedding_status(self, adapter_id: str) -> EmbeddingStatus:
        """Get embedding status for a specific adapter."""
        return self._stats_reporter.embedding_status(adapter_id)

    # ------------------------------------------------------------------
    # Configuration helpers
    # ------------------------------------------------------------------
    @property
    def config(self) -> RecommendationConfig:
        """Return configuration helpers for cache management."""
        return self._config

    # ------------------------------------------------------------------
    # Coordinator accessors
    # ------------------------------------------------------------------
    @property
    def embeddings(self) -> EmbeddingCoordinator:
        """Expose embedding coordination helpers."""
        return self._embedding_coordinator

    @property
    def feedback(self) -> FeedbackManager:
        """Expose feedback and preference management helpers."""
        return self._feedback_manager

    @property
    def reporter(self) -> StatsReporter:
        """Expose statistics reporting helpers."""
        return self._stats_reporter

    # ------------------------------------------------------------------
    # Exposed runtime configuration
    # ------------------------------------------------------------------
    @property
    def gpu_enabled(self) -> bool:
        """Return whether GPU acceleration is enabled."""
        return self._embedding_coordinator.gpu_enabled

    @property
    def device(self) -> str:
        """Return the configured device for embeddings."""
        return self._embedding_coordinator.device
