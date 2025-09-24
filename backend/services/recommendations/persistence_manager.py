"""Persistence helpers for recommendation embeddings and indexes."""

from __future__ import annotations

import pickle
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np

from backend.schemas.recommendations import IndexRebuildResponse

from .components.interfaces import RecommendationEngineProtocol
from .embedding_manager import EmbeddingManager


class RecommendationPersistenceManager:
    """Handle persistence of recommendation embeddings and indexes."""

    def __init__(
        self,
        embedding_manager: EmbeddingManager,
        engine_getter: Callable[[], RecommendationEngineProtocol],
        *,
        embedding_cache_dir: str | Path = "cache/embeddings",
        index_cache_path: str | Path = "cache/similarity_index.pkl",
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._embedding_manager = embedding_manager
        self._engine_getter = engine_getter
        self._embedding_cache_dir = Path(embedding_cache_dir)
        self._index_cache_path = Path(index_cache_path)
        self._clock = clock

        self._embedding_cache_dir.mkdir(parents=True, exist_ok=True)
        self._index_cache_path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def embedding_cache_dir(self) -> Path:
        """Return the directory used for cached embeddings."""
        return self._embedding_cache_dir

    @embedding_cache_dir.setter
    def embedding_cache_dir(self, value: str | Path) -> None:
        path = Path(value)
        path.mkdir(parents=True, exist_ok=True)
        self._embedding_cache_dir = path

    @property
    def index_cache_path(self) -> Path:
        """Return the persisted similarity index path."""
        return self._index_cache_path

    @index_cache_path.setter
    def index_cache_path(self, value: str | Path) -> None:
        path = Path(value)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._index_cache_path = path

    async def rebuild_similarity_index(
        self, *, force: bool = False
    ) -> IndexRebuildResponse:
        """Rebuild the similarity index and persist it to disk."""
        engine = self._engine_getter()
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

        await self._embedding_manager.build_similarity_index()

        indexed_items = len(getattr(engine, "lora_ids", []) or [])
        index_size = 0
        status = "empty"
        skipped_reason = None

        if indexed_items:
            payload = {
                "lora_ids": engine.lora_ids,
                "semantic_embeddings": np.asarray(engine.semantic_embeddings),
                "artistic_embeddings": np.asarray(engine.artistic_embeddings),
                "technical_embeddings": np.asarray(engine.technical_embeddings),
            }
            with index_file.open("wb") as handle:
                pickle.dump(payload, handle)
            index_size = index_file.stat().st_size
            status = "rebuilt"
        else:
            if index_file.exists():
                index_file.unlink()

        processing_time = self._clock() - start_time

        return IndexRebuildResponse(
            status=status,
            indexed_items=indexed_items,
            index_path=str(index_file),
            index_size_bytes=index_size,
            processing_time_seconds=processing_time,
            rebuilt_at=datetime.now(timezone.utc),
            skipped=False,
            skipped_reason=skipped_reason,
        )
