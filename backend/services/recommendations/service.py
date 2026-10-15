"""Recommendation service for LoRA adapter discovery and learning."""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterator, List, Optional, Sequence

from backend.models import RecommendationFeedback, UserPreference
from backend.schemas.recommendations import (
    EmbeddingStatus,
    RecommendationItem,
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
)

from . import strategies
from .embeddings import EmbeddingService
from .model_registry import RecommendationModelRegistry
from .repository import RecommendationRepository

# Default weights tuned against the post-description embedding mix.
DEFAULT_WEIGHTS: Dict[str, float] = {
    "semantic": 0.5,
    "artistic": 0.35,
    "technical": 0.15,
}


@dataclass
class QueryMetrics:
    """Aggregate recommendation query timings."""

    total_queries: int = 0
    total_query_time_ms: float = 0.0

    def record_query(self, elapsed_ms: float) -> None:
        """Record a completed recommendation query."""
        self.total_queries += 1
        self.total_query_time_ms += elapsed_ms

    @property
    def average_query_time(self) -> float:
        """Return the average query duration in milliseconds."""
        if self.total_queries == 0:
            return 0.0
        return self.total_query_time_ms / self.total_queries


class RecommendationService:
    """Serve recommendation queries, statistics, feedback and preferences.

    Every method blocks (database, model loading, encoding), so callers run
    them off the event loop.
    """

    def __init__(
        self,
        *,
        repository: RecommendationRepository,
        embeddings: EmbeddingService,
        model_registry: RecommendationModelRegistry,
        metrics: Optional[QueryMetrics] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Bind the service to its repository, embeddings and shared models."""
        self._repository = repository
        self._embeddings = embeddings
        self._model_registry = model_registry
        self._metrics = metrics or QueryMetrics()
        self._logger = logger or logging.getLogger(__name__)

    @property
    def embeddings(self) -> EmbeddingService:
        """Expose embedding workflows and runtime environment helpers."""
        return self._embeddings

    @property
    def gpu_enabled(self) -> bool:
        """Return whether GPU acceleration is enabled."""
        return self._embeddings.gpu_enabled

    @property
    def device(self) -> str:
        """Return the configured device for embeddings."""
        return self._embeddings.device

    # ------------------------------------------------------------------
    # Recommendation queries
    # ------------------------------------------------------------------
    @contextmanager
    def _timed_query(self) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            self._metrics.record_query((time.perf_counter() - start) * 1000)

    def similar_loras(
        self,
        *,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        diversify_results: bool = True,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Return LoRAs similar to the target adapter."""
        with self._timed_query():
            return strategies.get_similar_loras(
                target_lora_id=target_lora_id,
                limit=limit,
                similarity_threshold=similarity_threshold,
                diversify_results=diversify_results,
                weights=weights,
                repository=self._repository,
                embeddings=self._embeddings,
                engine=self._model_registry.get_recommendation_engine(),
            )

    def recommend_for_prompt(
        self,
        *,
        prompt: str,
        active_loras: Optional[Sequence[str]] = None,
        limit: int = 10,
        style_preference: Optional[str] = None,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Return LoRA recommendations that enhance the provided prompt."""
        with self._timed_query():
            return strategies.get_recommendations_for_prompt(
                prompt=prompt,
                active_loras=list(active_loras) if active_loras else None,
                limit=limit,
                style_preference=style_preference,
                weights=weights or dict(DEFAULT_WEIGHTS),
                repository=self._repository,
                embedder=self._model_registry.get_semantic_embedder(),
                device=self.device,
            )

    def recommend_for_trigger(
        self,
        *,
        trigger_query: str,
        limit: int = 10,
    ) -> List[RecommendationItem]:
        """Return LoRA recommendations that match the provided trigger query."""
        with self._timed_query():
            return strategies.get_recommendations_for_trigger(
                trigger_query=trigger_query,
                limit=limit,
                repository=self._repository,
                trigger_engine=self._model_registry.get_trigger_engine(),
                logger=self._logger,
            )

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------
    def stats(self) -> RecommendationStats:
        """Return recommendation system statistics."""
        repository = self._repository
        total_loras = repository.count_active_adapters()
        loras_with_embeddings = repository.count_lora_embeddings()
        embedding_coverage = (
            loras_with_embeddings / total_loras if total_loras > 0 else 0.0
        )

        last_index_update = repository.get_last_embedding_update()
        if last_index_update is None:
            last_index_update = datetime.now(timezone.utc)

        return RecommendationStats(
            total_loras=total_loras,
            loras_with_embeddings=loras_with_embeddings,
            embedding_coverage=embedding_coverage,
            avg_recommendation_time_ms=self._metrics.average_query_time,
            # No recommendation cache exists, so nothing records hits.
            cache_hit_rate=0.0,
            total_sessions=repository.count_recommendation_sessions(),
            user_preferences_count=repository.count_user_preferences(),
            feedback_count=repository.count_feedback(),
            model_memory_usage_gb=(
                self._embeddings.gpu_memory_usage_gb() if self.gpu_enabled else 0.0
            ),
            last_index_update=last_index_update,
        )

    def embedding_status(self, adapter_id: str) -> EmbeddingStatus:
        """Return embedding status information for a LoRA adapter."""
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

    # ------------------------------------------------------------------
    # Feedback and preferences
    # ------------------------------------------------------------------
    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback; raises ``ValueError`` if unknown."""
        return self._repository.record_feedback(feedback)

    def update_user_preference(
        self,
        preference: UserPreferenceRequest,
    ) -> UserPreference:
        """Create or update a persisted user preference record."""
        return self._repository.update_user_preference(preference)
