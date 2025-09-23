"""Reporting helpers for recommendation metrics and status."""

from __future__ import annotations

from backend.schemas.recommendations import EmbeddingStatus, RecommendationStats

from .interfaces import RecommendationMetricsTracker, RecommendationRepository


class StatsReporter:
    """Coordinate statistics gathering from metrics and persistence."""

    def __init__(
        self,
        *,
        metrics_tracker: RecommendationMetricsTracker,
        repository: RecommendationRepository,
    ) -> None:
        self._metrics_tracker = metrics_tracker
        self._repository = repository

    @property
    def metrics_tracker(self) -> RecommendationMetricsTracker:
        """Expose the underlying metrics tracker for compatibility."""

        return self._metrics_tracker

    def build_stats(self, *, gpu_enabled: bool) -> RecommendationStats:
        """Build a statistics snapshot for the recommendation system."""

        return self._metrics_tracker.build_stats(
            self._repository,
            gpu_enabled=gpu_enabled,
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
