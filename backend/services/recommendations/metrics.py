"""Helpers for tracking recommendation performance metrics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional

from backend.schemas.recommendations import RecommendationStats


@dataclass
class RecommendationMetrics:
    """Track aggregate query and cache performance information."""

    total_queries: int = 0
    total_query_time_ms: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0

    def record_query(self, elapsed_ms: float) -> None:
        """Record a completed recommendation query."""
        self.total_queries += 1
        self.total_query_time_ms += elapsed_ms

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self.cache_misses += 1

    @property
    def average_query_time(self) -> float:
        """Return the average query duration in milliseconds."""
        if self.total_queries == 0:
            return 0.0
        return self.total_query_time_ms / self.total_queries

    @property
    def cache_hit_rate(self) -> float:
        """Return the cache hit rate as a floating-point ratio."""
        total_requests = self.cache_hits + self.cache_misses
        if total_requests == 0:
            return 0.0
        return self.cache_hits / total_requests


class RecommendationMetricsTracker:
    """High level helper for aggregating recommendation metrics."""

    def __init__(
        self,
        metrics: Optional[RecommendationMetrics] = None,
        *,
        memory_probe: Optional[Callable[[], float]] = None,
    ) -> None:
        """Create a tracker with optional metric state and memory probe.

        Args:
            metrics: Existing metrics accumulator to reuse.
            memory_probe: Callable returning GPU memory usage in gigabytes.

        """
        self._metrics = metrics or RecommendationMetrics()
        self._memory_probe = memory_probe or self._default_memory_probe

    @property
    def metrics(self) -> RecommendationMetrics:
        """Expose the mutable metrics state."""
        return self._metrics

    def record_query(self, elapsed_ms: float) -> None:
        """Record a completed recommendation query duration."""
        self._metrics.record_query(elapsed_ms)

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self._metrics.record_cache_hit()

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self._metrics.record_cache_miss()

    @property
    def cache_hit_rate(self) -> float:
        """Return the cache hit rate as a floating point ratio."""
        return self._metrics.cache_hit_rate

    @property
    def average_query_time(self) -> float:
        """Return the average query duration in milliseconds."""
        return self._metrics.average_query_time

    def build_stats(
        self,
        repository,
        *,
        gpu_enabled: bool,
    ) -> RecommendationStats:
        """Assemble a ``RecommendationStats`` snapshot."""
        total_loras = repository.count_active_adapters()
        loras_with_embeddings = repository.count_lora_embeddings()
        embedding_coverage = (
            loras_with_embeddings / total_loras if total_loras > 0 else 0.0
        )

        user_preferences_count = repository.count_user_preferences()
        session_count = repository.count_recommendation_sessions()
        feedback_count = repository.count_feedback()

        memory_usage = self._memory_probe() if gpu_enabled else 0.0

        last_index_update = repository.get_last_embedding_update()
        if last_index_update is None:
            last_index_update = datetime.now(timezone.utc)

        return RecommendationStats(
            total_loras=total_loras,
            loras_with_embeddings=loras_with_embeddings,
            embedding_coverage=embedding_coverage,
            avg_recommendation_time_ms=self.average_query_time,
            cache_hit_rate=self.cache_hit_rate,
            total_sessions=session_count,
            user_preferences_count=user_preferences_count,
            feedback_count=feedback_count,
            model_memory_usage_gb=memory_usage,
            last_index_update=last_index_update,
        )

    @staticmethod
    def _default_memory_probe() -> float:
        """Inspect GPU memory usage via ``torch`` when available."""
        try:  # pragma: no cover - optional dependency
            import torch

            if torch.cuda.is_available():
                return torch.cuda.memory_allocated() / 1024**3
        except ImportError:  # pragma: no cover - optional dependency
            return 0.0
        return 0.0
