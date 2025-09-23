"""Tests covering recommendation persistence helpers."""

from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest

from backend.models import Adapter, LoRAEmbedding
from backend.services.recommendations import (
    EmbeddingBatchRunner,
    LoRAEmbeddingRepository,
    RecommendationPersistenceManager,
    RecommendationPersistenceService,
)


class TestRecommendationPersistenceService:
    """Unit tests for the high level persistence helper."""

    @pytest.mark.anyio("asyncio")
    async def test_skip_when_existing_index_present(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = ["existing"]

        manager = RecommendationPersistenceManager(
            MagicMock(),
            lambda: engine,
            index_cache_path=tmp_path / "index.pkl",
        )
        service = RecommendationPersistenceService(manager)

        result = await service.rebuild_similarity_index()

        assert result.skipped is True
        assert service.index_cache_path.endswith("index.pkl")

    @pytest.mark.anyio("asyncio")
    async def test_rebuild_persists_payload_to_disk(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = []
        engine.semantic_embeddings = []
        engine.artistic_embeddings = []
        engine.technical_embeddings = []

        async def populate_index():
            engine.lora_ids = ["a", "b"]
            engine.semantic_embeddings = np.array([[1.0], [0.5]], dtype=np.float32)
            engine.artistic_embeddings = np.array([[0.2], [0.3]], dtype=np.float32)
            engine.technical_embeddings = np.array([[0.9], [0.1]], dtype=np.float32)

        embedding_manager = MagicMock()
        embedding_manager.build_similarity_index = AsyncMock(side_effect=populate_index)

        manager = RecommendationPersistenceManager(
            embedding_manager,
            lambda: engine,
            index_cache_path=tmp_path / "rebuilt.pkl",
        )
        service = RecommendationPersistenceService(manager)

        result = await service.rebuild_similarity_index(force=True)

        assert result.status == "rebuilt"
        assert (tmp_path / "rebuilt.pkl").exists()
        embedding_manager.build_similarity_index.assert_awaited_once()


class TestEmbeddingBatchRunner:
    """Targeted tests for the embedding batch runner."""

    @pytest.mark.anyio("asyncio")
    async def test_batch_compute_skips_existing_embeddings(
        self,
        db_session,
        sample_adapter,
    ):
        db_session.add(sample_adapter)
        db_session.add(
            Adapter(
                id="adapter-2",
                name="Adapter 2",
                description="",
                file_path="/tmp/a2.safetensors",
                active=True,
            ),
        )
        db_session.commit()

        repository = LoRAEmbeddingRepository(db_session)
        computer = MagicMock()
        computer.compute = AsyncMock(return_value=True)

        runner = EmbeddingBatchRunner(repository, computer)

        db_session.add(
            LoRAEmbedding(
                adapter_id=sample_adapter.id,
                semantic_embedding=b"existing",
            ),
        )
        db_session.commit()

        result = await runner.run(force_recompute=False)

        assert result["skipped_count"] == 1
        computer.compute.assert_awaited_once()
        computer.compute.assert_awaited_with("adapter-2", force_recompute=False)
