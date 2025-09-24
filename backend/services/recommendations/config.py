"""Configuration helpers for the recommendation domain."""

from __future__ import annotations

from .interfaces import RecommendationPersistenceService


class RecommendationConfig:
    """Expose tunable persistence paths for recommendations."""

    def __init__(self, persistence: RecommendationPersistenceService) -> None:
        """Store the persistence service used to resolve paths."""
        self._persistence = persistence
        # Default weights tuned against the post-description embedding mix.
        self.default_weights = {
            "semantic": 0.5,
            "artistic": 0.35,
            "technical": 0.15,
        }

    @property
    def index_cache_path(self) -> str:
        """Return the persisted similarity index path."""
        return self._persistence.index_cache_path

    @index_cache_path.setter
    def index_cache_path(self, value: str) -> None:
        self._persistence.index_cache_path = value

    @property
    def embedding_cache_dir(self) -> str:
        """Return the embedding cache directory path."""
        return self._persistence.embedding_cache_dir

    @embedding_cache_dir.setter
    def embedding_cache_dir(self, value: str) -> None:
        self._persistence.embedding_cache_dir = value
