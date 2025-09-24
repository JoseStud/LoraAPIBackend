"""Utilities for constructing the in-memory similarity index."""

from __future__ import annotations

import asyncio
from typing import Callable

from .components.interfaces import RecommendationEngineProtocol
from .embedding_repository import LoRAEmbeddingRepository


class SimilarityIndexBuilder:
    """Rebuild the recommendation engine similarity index."""

    def __init__(
        self,
        repository: LoRAEmbeddingRepository,
        engine_getter: Callable[[], RecommendationEngineProtocol],
    ) -> None:
        """Store repository and callback used to obtain the engine."""
        self._repository = repository
        self._engine_getter = engine_getter

    async def build(self) -> None:
        """Fetch eligible adapters and rebuild the similarity index."""
        adapters = self._repository.list_active_adapters_with_embeddings()
        if not adapters:
            return

        engine = self._engine_getter()
        await asyncio.to_thread(engine.build_similarity_index, adapters)
