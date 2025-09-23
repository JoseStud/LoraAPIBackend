"""High level persistence helpers for recommendation caches."""

from __future__ import annotations

from pathlib import Path

from backend.schemas.recommendations import IndexRebuildResponse

from .interfaces import RecommendationPersistenceService as PersistenceServiceProtocol
from .persistence_manager import RecommendationPersistenceManager


class RecommendationPersistenceService(PersistenceServiceProtocol):
    """Adapter around ``RecommendationPersistenceManager`` with friendly APIs."""

    def __init__(self, manager: RecommendationPersistenceManager) -> None:
        self._manager = manager

    async def rebuild_similarity_index(self, *, force: bool = False) -> IndexRebuildResponse:
        """Delegate to the underlying persistence manager."""
        return await self._manager.rebuild_similarity_index(force=force)

    @property
    def index_cache_path(self) -> str:
        """Expose the configured similarity index path as a string."""
        return str(self._manager.index_cache_path)

    @index_cache_path.setter
    def index_cache_path(self, value: str) -> None:
        self._manager.index_cache_path = Path(value)

    @property
    def embedding_cache_dir(self) -> str:
        """Expose the embedding cache directory as a string."""
        return str(self._manager.embedding_cache_dir)

    @embedding_cache_dir.setter
    def embedding_cache_dir(self, value: str) -> None:
        self._manager.embedding_cache_dir = Path(value)

