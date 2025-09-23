"""Embedding and similarity index management for recommendations."""

from __future__ import annotations

from typing import Any, Callable, Dict, Sequence

from backend.models import Adapter

from .components.interfaces import (
    FeatureExtractorProtocol,
    RecommendationEngineProtocol,
)
from .embedding_batch_runner import EmbeddingBatchRunner
from .embedding_computer import EmbeddingComputer
from .embedding_repository import LoRAEmbeddingRepository
from .model_registry import RecommendationModelRegistry
from .similarity_index_builder import SimilarityIndexBuilder


class EmbeddingManager:
    """Orchestrate embedding collaborators for recommendations."""

    def __init__(
        self,
        repository: LoRAEmbeddingRepository,
        model_registry: RecommendationModelRegistry,
        *,
        feature_extractor_getter: Callable[[], FeatureExtractorProtocol] | None = None,
        recommendation_engine_getter: Callable[[], RecommendationEngineProtocol]
        | None = None,
        embedding_computer: EmbeddingComputer | None = None,
        batch_runner: EmbeddingBatchRunner | None = None,
        index_builder: SimilarityIndexBuilder | None = None,
    ) -> None:
        self._repository = repository
        self._model_registry = model_registry
        self._feature_extractor_getter = (
            feature_extractor_getter or self._model_registry.get_feature_extractor
        )
        self._recommendation_engine_getter = (
            recommendation_engine_getter
            or self._model_registry.get_recommendation_engine
        )

        self._computer = embedding_computer or EmbeddingComputer(
            repository,
            self._get_feature_extractor,
        )
        self._batch_runner = batch_runner or EmbeddingBatchRunner(
            repository,
            self._computer,
        )
        self._index_builder = index_builder or SimilarityIndexBuilder(
            repository,
            self._get_recommendation_engine,
        )

    def _get_feature_extractor(self) -> FeatureExtractorProtocol:
        return self._feature_extractor_getter()

    def _get_recommendation_engine(self) -> RecommendationEngineProtocol:
        return self._recommendation_engine_getter()

    async def compute_embeddings_for_lora(
        self,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:
        """Compute and persist embeddings for a single adapter."""
        return await self._computer.compute(
            adapter_id,
            force_recompute=force_recompute,
        )

    async def batch_compute_embeddings(
        self,
        adapter_ids: Sequence[str] | None = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple adapters efficiently."""
        return await self._batch_runner.run(
            adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
        )

    async def ensure_embeddings_exist(self, adapters: Sequence[Adapter]) -> None:
        """Ensure embeddings exist for the provided adapters."""
        adapter_ids = [adapter.id for adapter in adapters]
        existing_ids = self._repository.list_existing_embedding_ids(adapter_ids)
        missing_ids = [adapter_id for adapter_id in adapter_ids if adapter_id not in existing_ids]

        if missing_ids:
            await self.batch_compute_embeddings(missing_ids)

    async def build_similarity_index(self) -> None:
        """Build the in-memory similarity index for active adapters."""
        await self._index_builder.build()
