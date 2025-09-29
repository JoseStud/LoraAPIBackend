"""Tests for recommendation use cases."""

from dataclasses import dataclass
import pickle
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from backend.services.recommendations import (
    PromptRecommendationUseCase,
    SimilarLoraUseCase,
)


class TestRecommendationUseCases:
    """Ensure focused use cases delegate correctly."""

    @pytest.mark.anyio("asyncio")
    async def test_similar_use_case_records_metrics(self):
        repository = MagicMock()
        workflow = MagicMock()
        engine_provider = MagicMock(return_value=MagicMock())
        metrics = MagicMock()
        use_case = SimilarLoraUseCase(
            repository=repository,
            embedding_workflow=workflow,
            engine_provider=engine_provider,
            metrics=metrics,
        )

        payload = [MagicMock()]
        strategy = AsyncMock(return_value=payload)

        with patch(
            "backend.services.recommendations.use_cases.similar_loras_strategy",
            strategy,
        ):
            result = await use_case.execute(
                target_lora_id="adapter-id",
                limit=5,
                similarity_threshold=0.3,
                diversify_results=True,
                weights=None,
            )

        assert result == payload
        strategy.assert_awaited_once_with(
            target_lora_id="adapter-id",
            limit=5,
            similarity_threshold=0.3,
            diversify_results=True,
            weights=None,
            repository=repository,
            embedding_manager=workflow,
            engine=engine_provider.return_value,
        )
        engine_provider.assert_called_once()
        metrics.record_query.assert_called_once()

    @pytest.mark.anyio("asyncio")
    async def test_prompt_use_case_records_metrics(self):
        repository = MagicMock()
        embedder_provider = MagicMock(return_value=MagicMock())
        metrics = MagicMock()
        use_case = PromptRecommendationUseCase(
            repository=repository,
            embedder_provider=embedder_provider,
            metrics=metrics,
            device="cpu",
        )

        payload = [MagicMock()]
        strategy = AsyncMock(return_value=payload)

        with patch(
            "backend.services.recommendations.use_cases.prompt_strategy",
            strategy,
        ):
            result = await use_case.execute(
                prompt="test",
                active_loras=["a"],
                limit=3,
                style_preference=None,
                weights={},
            )

        assert result == payload
        strategy.assert_awaited_once()
        embedder_provider.assert_called_once()
        metrics.record_query.assert_called_once()

    @pytest.mark.anyio("asyncio")
    async def test_prompt_use_case_generates_embeddings(self):
        @dataclass
        class _Adapter:
            id: str
            name: str
            description: Optional[str]
            tags: tuple[str, ...]
            author_username: str
            sd_version: Optional[str]
            nsfw_level: Optional[str]

        @dataclass
        class _Embedding:
            semantic_embedding: bytes
            artistic_embedding: bytes
            technical_embedding: bytes
            predicted_style: Optional[str]

        class _Repository:
            def __init__(self, adapter: _Adapter, embedding: _Embedding) -> None:
                self._data = [(adapter, embedding)]

            def get_active_loras_with_embeddings(self, *, exclude_ids=None):
                return self._data

        class _Embedder:
            def __init__(self) -> None:
                self.calls: List[tuple[str, Optional[str]]] = []
                self._vector = np.asarray([1.0, 0.0, 0.0], dtype=np.float32)

            def compute_prompt_embeddings(self, prompt: str, *, device: Optional[str] = None):
                self.calls.append((prompt, device))
                return {
                    "semantic": self._vector,
                    "artistic": self._vector,
                    "technical": self._vector,
                }

        adapter = _Adapter(
            id="adapter-1",
            name="Aurora",
            description="Celestial style adapter",
            tags=("fantasy", "portrait"),
            author_username="artist",
            sd_version="1.5",
            nsfw_level="safe",
        )
        embedding_vector = np.asarray([1.0, 0.0, 0.0], dtype=np.float32)
        embedding = _Embedding(
            semantic_embedding=pickle.dumps(embedding_vector),
            artistic_embedding=pickle.dumps(embedding_vector),
            technical_embedding=pickle.dumps(embedding_vector),
            predicted_style="dreamy",
        )
        repository = _Repository(adapter, embedding)
        embedder = _Embedder()
        metrics = MagicMock()
        use_case = PromptRecommendationUseCase(
            repository=repository,
            embedder_provider=lambda: embedder,
            metrics=metrics,
            device="cpu",
        )

        results = await use_case.execute(
            prompt="glowing forest",
            active_loras=None,
            limit=1,
            style_preference=None,
            weights={"semantic": 1.0, "artistic": 1.0, "technical": 1.0},
        )

        assert len(results) == 1
        assert embedder.calls == [("glowing forest", "cpu")]
        metrics.record_query.assert_called_once()
