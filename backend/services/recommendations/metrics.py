"""Helper for tracking recommendation performance metrics."""

from dataclasses import dataclass


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
