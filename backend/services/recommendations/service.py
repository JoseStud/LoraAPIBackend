"""Recommendation service for LoRA adapter discovery and learning."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from backend.models import RecommendationFeedback, UserPreference
from backend.schemas.recommendations import (
    EmbeddingStatus,
    IndexRebuildResponse,
    RecommendationItem,
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
)

from .interfaces import (
    EmbeddingWorkflow,
    RecommendationBootstrap,
    RecommendationMetricsTracker,
    RecommendationPersistenceService,
    RecommendationRepository,
)
from .model_bootstrap import RecommendationModelBootstrap
from .config import RecommendationConfig
from .use_cases import (
    PromptRecommendationUseCase,
    SimilarLoraUseCase,
)


class RecommendationService:
    """Service for generating intelligent LoRA recommendations."""

    def __init__(
        self,
        *,
        bootstrap: RecommendationBootstrap,
        repository: RecommendationRepository,
        embedding_workflow: EmbeddingWorkflow,
        persistence_service: RecommendationPersistenceService,
        metrics_tracker: RecommendationMetricsTracker,
        similar_lora_use_case: Optional[SimilarLoraUseCase] = None,
        prompt_recommendation_use_case: Optional[PromptRecommendationUseCase] = None,
        config: Optional[RecommendationConfig] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)
        self._bootstrap = bootstrap
        self._repository = repository
        self._embedding_workflow = embedding_workflow
        self._persistence_service = persistence_service
        self._metrics_tracker = metrics_tracker

        self.gpu_enabled = bootstrap.gpu_enabled
        self.device = bootstrap.device
        model_registry = bootstrap.get_model_registry()

        self._similar_lora_use_case = similar_lora_use_case or SimilarLoraUseCase(
            repository=repository,
            embedding_workflow=embedding_workflow,
            engine_provider=model_registry.get_recommendation_engine,
            metrics=metrics_tracker,
        )
        self._prompt_recommendation_use_case = (
            prompt_recommendation_use_case
            or PromptRecommendationUseCase(
                repository=repository,
                embedder_provider=model_registry.get_semantic_embedder,
                metrics=metrics_tracker,
                device=self.device,
            )
        )
        self._config = config or RecommendationConfig(persistence_service)

    @staticmethod
    def is_gpu_available() -> bool:
        """Detect GPU availability across CUDA, ROCm, and MPS runtimes."""

        return RecommendationModelBootstrap.is_gpu_available()

    @classmethod
    def preload_models(cls, gpu_enabled: Optional[bool] = None) -> None:
        """Eagerly load heavy shared models so the first request is fast."""

        RecommendationModelBootstrap.preload_models_for_environment(
            gpu_enabled=gpu_enabled
        )

    async def get_similar_loras(
        self,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Get LoRAs similar to the target LoRA."""

        return await self._similar_lora_use_case.execute(
            target_lora_id=target_lora_id,
            limit=limit,
            similarity_threshold=similarity_threshold,
            weights=weights,
        )

    async def get_recommendations_for_prompt(
        self,
        prompt: str,
        active_loras: List[str] = None,
        limit: int = 10,
        style_preference: Optional[str] = None,
    ) -> List[RecommendationItem]:
        """Get LoRA recommendations that enhance a given prompt."""

        return await self._prompt_recommendation_use_case.execute(
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
        """Compute and store embeddings for a single LoRA."""
        return await self._embedding_workflow.compute_embeddings_for_lora(
            adapter_id,
            force_recompute=force_recompute,
        )

    async def batch_compute_embeddings(
        self,
        adapter_ids: List[str] = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple LoRAs efficiently."""
        return await self._embedding_workflow.batch_compute_embeddings(
            adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
        )

    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""
        return self._repository.record_feedback(feedback)

    def update_user_preference(
        self,
        preference: UserPreferenceRequest,
    ) -> UserPreference:
        """Create or update a persisted user preference record."""
        return self._repository.update_user_preference(preference)

    async def rebuild_similarity_index(
        self,
        *,
        force: bool = False,
    ) -> IndexRebuildResponse:
        """Rebuild the cached similarity index and persist it to disk."""

        return await self._persistence_service.rebuild_similarity_index(force=force)

    @property
    def config(self) -> RecommendationConfig:
        """Return configuration helpers for cache management."""

        return self._config

    def get_recommendation_stats(self) -> RecommendationStats:
        """Get comprehensive recommendation system statistics."""
        return self._metrics_tracker.build_stats(
            self._repository,
            gpu_enabled=self.gpu_enabled,
        )

    @property
    def _total_queries(self) -> int:
        """Backwards compatibility for legacy metrics access."""
        return self._metrics_tracker.metrics.total_queries

    @property
    def _total_query_time(self) -> float:
        return self._metrics_tracker.metrics.total_query_time_ms

    @property
    def _cache_hits(self) -> int:
        return self._metrics_tracker.metrics.cache_hits

    @property
    def _cache_misses(self) -> int:
        return self._metrics_tracker.metrics.cache_misses

    def get_embedding_status(self, adapter_id: str) -> EmbeddingStatus:
        """Get embedding status for a specific adapter."""
        embedding = self._repository.get_embedding(adapter_id)

        if not embedding:
            return EmbeddingStatus(
                adapter_id=adapter_id,
                has_semantic_embedding=False,
                has_artistic_embedding=False,
                has_technical_embedding=False,
                has_extracted_features=False,
                needs_recomputation=True,
            )
        
        return EmbeddingStatus(
            adapter_id=adapter_id,
            has_semantic_embedding=bool(embedding.semantic_embedding),
            has_artistic_embedding=bool(embedding.artistic_embedding),
            has_technical_embedding=bool(embedding.technical_embedding),
            has_extracted_features=bool(embedding.extracted_keywords),
            last_computed=embedding.last_computed,
            needs_recomputation=False,
        )
