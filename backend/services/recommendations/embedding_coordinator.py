"""Coordinators for embedding workflows and runtime configuration."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Sequence

from backend.schemas.recommendations import IndexRebuildResponse

from .interfaces import (
    EmbeddingWorkflow,
    RecommendationBootstrap,
    RecommendationPersistenceService,
)
from .model_bootstrap import RecommendationModelBootstrap


class EmbeddingCoordinator:
    """Coordinate embedding workflows and runtime configuration."""

    def __init__(
        self,
        *,
        bootstrap: RecommendationBootstrap,
        embedding_workflow: EmbeddingWorkflow,
        persistence_service: RecommendationPersistenceService,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)
        self._bootstrap = bootstrap
        self._embedding_workflow = embedding_workflow
        self._persistence_service = persistence_service

    # ------------------------------------------------------------------
    # Runtime configuration helpers
    # ------------------------------------------------------------------
    @property
    def device(self) -> str:
        """Return the preferred execution device for embeddings."""

        return self._bootstrap.device

    @property
    def gpu_enabled(self) -> bool:
        """Return whether GPU acceleration is enabled."""

        return self._bootstrap.gpu_enabled

    # ------------------------------------------------------------------
    # Embedding workflows
    # ------------------------------------------------------------------
    async def compute_for_lora(
        self,
        adapter_id: str,
        *,
        force_recompute: bool = False,
    ) -> bool:
        """Compute embeddings for a single LoRA adapter."""

        return await self._embedding_workflow.compute_embeddings_for_lora(
            adapter_id,
            force_recompute=force_recompute,
        )

    async def compute_batch(
        self,
        adapter_ids: Optional[Sequence[str]] = None,
        *,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple adapters."""

        return await self._embedding_workflow.batch_compute_embeddings(
            adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
        )

    async def refresh_similarity_index(
        self,
        *,
        force: bool = False,
    ) -> IndexRebuildResponse:
        """Rebuild and persist the similarity index cache."""

        return await self._persistence_service.rebuild_similarity_index(force=force)

    # ------------------------------------------------------------------
    # Bootstrap helpers
    # ------------------------------------------------------------------
    @staticmethod
    def is_gpu_available() -> bool:
        """Detect GPU availability across supported runtimes."""

        return RecommendationModelBootstrap.is_gpu_available()

    @classmethod
    def preload_models(cls, gpu_enabled: Optional[bool] = None) -> None:
        """Eagerly load shared models for the detected environment."""

        RecommendationModelBootstrap.preload_models_for_environment(
            gpu_enabled=gpu_enabled,
        )
