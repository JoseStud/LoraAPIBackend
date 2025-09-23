"""Compute embeddings for individual adapters."""

from __future__ import annotations

import asyncio
from typing import Callable

from .components.interfaces import FeatureExtractorProtocol
from .embedding_repository import LoRAEmbeddingRepository


class EmbeddingComputer:
    """Handle feature extraction and persistence for a single adapter."""

    def __init__(
        self,
        repository: LoRAEmbeddingRepository,
        feature_extractor_getter: Callable[[], FeatureExtractorProtocol],
    ) -> None:
        self._repository = repository
        self._feature_extractor_getter = feature_extractor_getter

    async def compute(self, adapter_id: str, *, force_recompute: bool = False) -> bool:
        """Compute embeddings for ``adapter_id`` and persist them."""
        adapter = self._repository.get_adapter(adapter_id)
        if adapter is None:
            raise ValueError(f"Adapter {adapter_id} not found")

        if not force_recompute and self._repository.embedding_exists(adapter_id):
            return True

        extractor = self._feature_extractor_getter()

        try:
            features = await asyncio.to_thread(
                extractor.extract_advanced_features,
                adapter,
            )
        except Exception as exc:  # pragma: no cover - propagate context
            raise RuntimeError(
                f"Failed to extract features for {adapter_id}: {exc}",
            ) from exc

        try:
            self._repository.save_features(adapter_id, features)
        except Exception as exc:  # pragma: no cover - propagate context
            raise RuntimeError(
                f"Failed to persist embeddings for {adapter_id}: {exc}",
            ) from exc

        return True

