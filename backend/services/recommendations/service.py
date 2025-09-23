"""Recommendation service for LoRA adapter discovery and learning."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from backend.models import RecommendationFeedback, UserPreference
from backend.schemas.recommendations import (
    EmbeddingStatus,
    IndexRebuildResponse,
    RecommendationItem,
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
)

from .config import RecommendationConfig
from .embedding_coordinator import EmbeddingCoordinator
from .feedback_manager import FeedbackManager
from .interfaces import (
    EmbeddingWorkflow,
    RecommendationBootstrap,
    RecommendationMetricsTracker,
    RecommendationPersistenceService,
    RecommendationRepository,
)
from .stats_reporter import StatsReporter
from .use_cases import (
    PromptRecommendationUseCase,
    SimilarLoraUseCase,
)


class RecommendationService:
    """Facade service for orchestrating LoRA recommendations."""

    def __init__(
        self,
        *,
        embedding_coordinator: Optional[EmbeddingCoordinator] = None,
        feedback_manager: Optional[FeedbackManager] = None,
        stats_reporter: Optional[StatsReporter] = None,
        similar_lora_use_case: Optional[SimilarLoraUseCase] = None,
        prompt_recommendation_use_case: Optional[PromptRecommendationUseCase] = None,
        config: Optional[RecommendationConfig] = None,
        # Legacy wiring support
        bootstrap: Optional[RecommendationBootstrap] = None,
        repository: Optional[RecommendationRepository] = None,
        embedding_workflow: Optional[EmbeddingWorkflow] = None,
        persistence_service: Optional[RecommendationPersistenceService] = None,
        metrics_tracker: Optional[RecommendationMetricsTracker] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)

        if embedding_coordinator is None:
            if not all((bootstrap, embedding_workflow, persistence_service)):
                raise ValueError(
                    "EmbeddingCoordinator must be provided or legacy dependencies supplied",
                )
            embedding_coordinator = EmbeddingCoordinator(
                bootstrap=bootstrap,
                embedding_workflow=embedding_workflow,
                persistence_service=persistence_service,
                logger=self._logger,
            )
        self._embedding_coordinator = embedding_coordinator

        if feedback_manager is None:
            if repository is None:
                raise ValueError(
                    "FeedbackManager requires a recommendation repository",
                )
            feedback_manager = FeedbackManager(repository)
        self._feedback_manager = feedback_manager

        if stats_reporter is None:
            if repository is None or metrics_tracker is None:
                raise ValueError(
                    "StatsReporter requires repository and metrics tracker",
                )
            stats_reporter = StatsReporter(
                metrics_tracker=metrics_tracker,
                repository=repository,
            )
        self._stats_reporter = stats_reporter
        self._metrics_tracker = getattr(
            self._stats_reporter,
            "metrics_tracker",
            metrics_tracker,
        )

        if similar_lora_use_case is None:
            if repository is None or embedding_workflow is None or bootstrap is None or metrics_tracker is None:
                raise ValueError(
                    "SimilarLoraUseCase dependencies are not satisfied",
                )
            model_registry = bootstrap.get_model_registry()
            similar_lora_use_case = SimilarLoraUseCase(
                repository=repository,
                embedding_workflow=embedding_workflow,
                engine_provider=model_registry.get_recommendation_engine,
                metrics=metrics_tracker,
            )
        self._similar_lora_use_case = similar_lora_use_case

        if prompt_recommendation_use_case is None:
            if repository is None or bootstrap is None or metrics_tracker is None:
                raise ValueError(
                    "PromptRecommendationUseCase dependencies are not satisfied",
                )
            model_registry = bootstrap.get_model_registry()
            prompt_recommendation_use_case = PromptRecommendationUseCase(
                repository=repository,
                embedder_provider=model_registry.get_semantic_embedder,
                metrics=metrics_tracker,
                device=self._embedding_coordinator.device,
            )
        self._prompt_recommendation_use_case = prompt_recommendation_use_case

        if config is None:
            if persistence_service is None:
                raise ValueError(
                    "RecommendationConfig requires a persistence service",
                )
            config = RecommendationConfig(persistence_service)
        self._config = config

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

    # ------------------------------------------------------------------
    # Recommendation workflows
    # ------------------------------------------------------------------
    async def similar_loras(
        self,
        *,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Return LoRAs similar to the target adapter."""

        return await self._similar_lora_use_case.execute(
            target_lora_id=target_lora_id,
            limit=limit,
            similarity_threshold=similarity_threshold,
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
    async def compute_embeddings(
        self,
        *,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:
        """Compute embeddings for a single adapter."""

        return await self._embedding_coordinator.compute_for_lora(
            adapter_id,
            force_recompute=force_recompute,
        )

    async def compute_embeddings_batch(
        self,
        *,
        adapter_ids: Optional[Sequence[str]] = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple adapters."""

        return await self._embedding_coordinator.compute_batch(
            adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
        )

    async def refresh_indexes(self, *, force: bool = False) -> IndexRebuildResponse:
        """Refresh the persisted similarity index."""

        return await self._embedding_coordinator.refresh_similarity_index(force=force)

    # ------------------------------------------------------------------
    # Feedback and preferences
    # ------------------------------------------------------------------
    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""

        return self._feedback_manager.record_feedback(feedback)

    def update_user_preference(
        self,
        preference: UserPreferenceRequest,
    ) -> UserPreference:
        """Create or update a persisted user preference record."""

        return self._feedback_manager.update_user_preference(preference)

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
    # Backwards compatibility shims
    # ------------------------------------------------------------------
    async def get_similar_loras(
        self,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Backward compatible wrapper for :meth:`similar_loras`."""

        return await self.similar_loras(
            target_lora_id=target_lora_id,
            limit=limit,
            similarity_threshold=similarity_threshold,
            weights=weights,
        )

    async def get_recommendations_for_prompt(
        self,
        prompt: str,
        active_loras: Optional[Sequence[str]] = None,
        limit: int = 10,
        style_preference: Optional[str] = None,
    ) -> List[RecommendationItem]:
        """Backward compatible wrapper for :meth:`recommend_for_prompt`."""

        return await self.recommend_for_prompt(
            prompt=prompt,
            active_loras=active_loras,
            limit=limit,
            style_preference=style_preference,
        )

    async def compute_embeddings_for_lora(
        self,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:
        """Backward compatible wrapper for :meth:`compute_embeddings`."""

        return await self.compute_embeddings(
            adapter_id=adapter_id,
            force_recompute=force_recompute,
        )

    async def batch_compute_embeddings(
        self,
        adapter_ids: Optional[Sequence[str]] = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Backward compatible wrapper for :meth:`compute_embeddings_batch`."""

        return await self.compute_embeddings_batch(
            adapter_ids=adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
        )

    async def rebuild_similarity_index(
        self,
        *,
        force: bool = False,
    ) -> IndexRebuildResponse:
        """Backward compatible wrapper for :meth:`refresh_indexes`."""

        return await self.refresh_indexes(force=force)

    def get_recommendation_stats(self) -> RecommendationStats:
        """Backward compatible wrapper for :meth:`stats`."""

        return self.stats()

    def get_embedding_status(self, adapter_id: str) -> EmbeddingStatus:
        """Backward compatible wrapper for :meth:`embedding_status`."""

        return self.embedding_status(adapter_id)

    # ------------------------------------------------------------------
    # Configuration helpers
    # ------------------------------------------------------------------
    @property
    def config(self) -> RecommendationConfig:
        """Return configuration helpers for cache management."""

        return self._config

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

    # ------------------------------------------------------------------
    # Legacy metrics properties preserved for compatibility
    # ------------------------------------------------------------------
    @property
    def _total_queries(self) -> int:
        """Backwards compatibility for legacy metrics access."""

        if self._metrics_tracker is None:
            raise AttributeError("Recommendation metrics are not available")
        return self._metrics_tracker.metrics.total_queries

    @property
    def _total_query_time(self) -> float:
        if self._metrics_tracker is None:
            raise AttributeError("Recommendation metrics are not available")
        return self._metrics_tracker.metrics.total_query_time_ms

    @property
    def _cache_hits(self) -> int:
        if self._metrics_tracker is None:
            raise AttributeError("Recommendation metrics are not available")
        return self._metrics_tracker.metrics.cache_hits

    @property
    def _cache_misses(self) -> int:
        if self._metrics_tracker is None:
            raise AttributeError("Recommendation metrics are not available")
        return self._metrics_tracker.metrics.cache_misses
