"""Embedding computation, the similarity index, and GPU/model bootstrap."""

from __future__ import annotations

import pickle
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Sequence

import numpy as np

from backend.core.logging import get_logger
from backend.models import Adapter
from backend.schemas.recommendations import IndexRebuildResponse

from .model_registry import RecommendationModelRegistry
from .repository import RecommendationRepository

logger = get_logger(__name__)


class EmbeddingService:
    """Single entry point for GPU detection, model loading and embedding work.

    Computation and index methods are synchronous (database, model loading,
    encoding and file I/O), so async callers run them through
    ``asyncio.to_thread``; ML libraries are only imported lazily.
    """

    def __init__(
        self,
        repository: RecommendationRepository,
        model_registry: RecommendationModelRegistry,
        *,
        index_cache_path: str | Path = "cache/similarity_index.pkl",
        clock: Callable[[], float] = time.time,
    ) -> None:
        """Bind the service to a repository, model registry and index path."""
        self._repository = repository
        self._model_registry = model_registry
        self._index_cache_path = Path(index_cache_path)
        self._clock = clock

    # ------------------------------------------------------------------
    # Runtime environment
    # ------------------------------------------------------------------
    @staticmethod
    def is_gpu_available() -> bool:
        """Detect GPU availability across CUDA, ROCm, and MPS runtimes."""
        try:
            import torch

            # ``torch.cuda`` also reports ROCm (HIP) devices. A ROCm build of
            # torch without a usable GPU must not count as GPU-capable.
            if torch.cuda.is_available():
                return True
            if torch.backends.mps.is_available():
                return True
            return False
        except ImportError:
            return False

    @classmethod
    def preload_models(cls, gpu_enabled: Optional[bool] = None) -> None:
        """Eagerly load shared models so the first request is fast."""
        if gpu_enabled is None:
            gpu_enabled = cls.is_gpu_available()
        RecommendationModelRegistry(gpu_enabled=gpu_enabled).preload()

    @staticmethod
    def models_loaded() -> bool:
        """Return whether shared models have been loaded for the process."""
        return RecommendationModelRegistry.models_loaded()

    @staticmethod
    def gpu_memory_usage_gb() -> float:
        """Return allocated GPU memory in gigabytes, or 0.0 without torch."""
        try:  # pragma: no cover - optional dependency
            import torch

            if torch.cuda.is_available():
                return torch.cuda.memory_allocated() / 1024**3
        except ImportError:  # pragma: no cover - optional dependency
            return 0.0
        return 0.0

    @property
    def device(self) -> str:
        """Return the preferred execution device for embeddings."""
        return self._model_registry.device

    @property
    def gpu_enabled(self) -> bool:
        """Return whether GPU acceleration is enabled."""
        return self._model_registry.gpu_enabled

    # ------------------------------------------------------------------
    # Embedding computation
    # ------------------------------------------------------------------
    def compute_for_lora(
        self,
        adapter_id: str,
        *,
        force_recompute: bool = False,
    ) -> bool:
        """Compute and persist embeddings for a single adapter."""
        adapter = self._repository.get_adapter(adapter_id)
        if adapter is None:
            raise ValueError(f"Adapter {adapter_id} not found")

        if (
            not force_recompute
            and self._repository.get_embedding(adapter_id) is not None
        ):
            return True

        extractor = self._model_registry.get_feature_extractor()

        try:
            features = extractor.extract_advanced_features(adapter)
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

    def compute_batch(
        self,
        adapter_ids: Optional[Sequence[str]] = None,
        *,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for ``adapter_ids`` (or all active adapters)."""
        start_time = time.time()

        adapters = self._repository.list_adapters(adapter_ids)

        skipped_due_to_existing = 0
        if not force_recompute:
            existing_ids = self._repository.list_existing_embedding_ids(
                [adapter.id for adapter in adapters],
            )
            pre_filter_count = len(adapters)
            adapters = [
                adapter for adapter in adapters if adapter.id not in existing_ids
            ]
            skipped_due_to_existing = pre_filter_count - len(adapters)

        processed_count = 0
        errors: list[Dict[str, str]] = []

        for start in range(0, len(adapters), batch_size):
            for adapter in adapters[start : start + batch_size]:
                try:
                    self.compute_for_lora(
                        adapter.id,
                        force_recompute=force_recompute,
                    )
                    processed_count += 1
                except Exception:
                    # The batch result reaches API clients, so the exception
                    # text is only logged.
                    logger.exception("Embedding computation failed for %s", adapter.id)
                    errors.append(
                        {
                            "adapter_id": adapter.id,
                            "error": "Embedding computation failed",
                        },
                    )

        return {
            "processed_count": processed_count,
            "skipped_count": skipped_due_to_existing,
            "error_count": len(errors),
            "processing_time_seconds": time.time() - start_time,
            "errors": errors,
            "completed_at": datetime.now(timezone.utc),
        }

    def ensure_embeddings_exist(self, adapters: Sequence[Adapter]) -> None:
        """Compute embeddings for any of ``adapters`` that lack them."""
        adapter_ids = [adapter.id for adapter in adapters]
        existing_ids = self._repository.list_existing_embedding_ids(adapter_ids)
        missing_ids = [
            adapter_id for adapter_id in adapter_ids if adapter_id not in existing_ids
        ]

        if missing_ids:
            self.compute_batch(missing_ids)

    # ------------------------------------------------------------------
    # Similarity index
    # ------------------------------------------------------------------
    def build_similarity_index(self) -> None:
        """Build the in-memory similarity index for active adapters."""
        adapters = self._repository.list_active_adapters_with_embeddings()
        if not adapters:
            return

        engine = self._model_registry.get_recommendation_engine()
        engine.build_similarity_index(adapters)

    def refresh_similarity_index(
        self,
        *,
        force: bool = False,
    ) -> IndexRebuildResponse:
        """Rebuild the similarity index and persist it to disk."""
        engine = self._model_registry.get_recommendation_engine()
        index_file = self._index_cache_path

        if not force and getattr(engine, "lora_ids", None):
            index_size = index_file.stat().st_size if index_file.exists() else 0
            return IndexRebuildResponse(
                status="skipped",
                indexed_items=len(engine.lora_ids),
                index_path=str(index_file),
                index_size_bytes=index_size,
                processing_time_seconds=0.0,
                rebuilt_at=datetime.now(timezone.utc),
                skipped=True,
                skipped_reason="existing_index",
            )

        start_time = self._clock()

        self.build_similarity_index()

        indexed_items = len(getattr(engine, "lora_ids", []) or [])
        index_size = 0
        status = "empty"

        if indexed_items:
            payload = {
                "lora_ids": engine.lora_ids,
                "semantic_embeddings": np.asarray(engine.semantic_embeddings),
                "artistic_embeddings": np.asarray(engine.artistic_embeddings),
                "technical_embeddings": np.asarray(engine.technical_embeddings),
            }
            index_file.parent.mkdir(parents=True, exist_ok=True)
            with index_file.open("wb") as handle:
                pickle.dump(payload, handle)
            index_size = index_file.stat().st_size
            status = "rebuilt"
        elif index_file.exists():
            index_file.unlink()

        return IndexRebuildResponse(
            status=status,
            indexed_items=indexed_items,
            index_path=str(index_file),
            index_size_bytes=index_size,
            processing_time_seconds=self._clock() - start_time,
            rebuilt_at=datetime.now(timezone.utc),
            skipped=False,
            skipped_reason=None,
        )
