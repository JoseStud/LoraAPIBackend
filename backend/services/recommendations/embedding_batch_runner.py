"""Batch orchestration for embedding computation."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, Sequence

from .embedding_computer import EmbeddingComputer
from .embedding_repository import LoRAEmbeddingRepository


class EmbeddingBatchRunner:
    """Coordinate batched embedding computation."""

    def __init__(
        self,
        repository: LoRAEmbeddingRepository,
        computer: EmbeddingComputer,
    ) -> None:
        self._repository = repository
        self._computer = computer

    async def run(
        self,
        adapter_ids: Sequence[str] | None = None,
        *,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for ``adapter_ids`` (or all active adapters)."""
        start_time = time.time()

        adapters = self._repository.list_adapters(adapter_ids)

        skipped_due_to_existing = 0

        if not force_recompute:
            adapter_ids_to_check = [adapter.id for adapter in adapters]
            existing_ids = self._repository.list_existing_embedding_ids(
                adapter_ids_to_check,
            )
            pre_filter_count = len(adapters)
            adapters = [
                adapter for adapter in adapters if adapter.id not in existing_ids
            ]
            skipped_due_to_existing = pre_filter_count - len(adapters)

        processed_count = 0
        error_count = 0
        errors: list[Dict[str, str]] = []

        for start in range(0, len(adapters), batch_size):
            batch = adapters[start : start + batch_size]
            for adapter in batch:
                try:
                    await self._computer.compute(
                        adapter.id,
                        force_recompute=force_recompute,
                    )
                    processed_count += 1
                except Exception as exc:  # pragma: no cover - detailed reporting only
                    error_count += 1
                    errors.append(
                        {
                            "adapter_id": adapter.id,
                            "error": str(exc),
                        },
                    )

        processing_time = time.time() - start_time

        return {
            "processed_count": processed_count,
            "skipped_count": skipped_due_to_existing,
            "error_count": error_count,
            "processing_time_seconds": processing_time,
            "errors": errors,
            "completed_at": datetime.now(timezone.utc),
        }
