"""Tests for recommendation queries served by the recommendation service."""

import pickle
from dataclasses import dataclass
from typing import List, Optional
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from backend.services.recommendations import (
    DEFAULT_WEIGHTS,
    QueryMetrics,
    RecommendationService,
)

STRATEGIES = "backend.services.recommendations.strategies"


def _service(repository=None, registry=None, metrics=None) -> RecommendationService:
    embeddings = MagicMock()
    embeddings.device = "cpu"
    embeddings.gpu_enabled = False
    return RecommendationService(
        repository=repository or MagicMock(),
        embeddings=embeddings,
        model_registry=registry or MagicMock(),
        metrics=metrics,
    )


class TestRecommendationQueries:
    """Ensure queries call the strategies with the right collaborators."""

    def test_similar_loras_records_metrics(self):
        repository = MagicMock()
        registry = MagicMock()
        metrics = MagicMock()
        service = _service(repository, registry, metrics)

        payload = [MagicMock()]
        strategy = MagicMock(return_value=payload)

        with patch(f"{STRATEGIES}.get_similar_loras", strategy):
            result = service.similar_loras(
                target_lora_id="adapter-id",
                limit=5,
                similarity_threshold=0.3,
                diversify_results=True,
                weights=None,
            )

        assert result == payload
        strategy.assert_called_once_with(
            target_lora_id="adapter-id",
            limit=5,
            similarity_threshold=0.3,
            diversify_results=True,
            weights=None,
            repository=repository,
            embeddings=service.embeddings,
            engine=registry.get_recommendation_engine.return_value,
        )
        registry.get_recommendation_engine.assert_called_once()
        metrics.record_query.assert_called_once()

    def test_similar_loras_passes_diversify_flag(self):
        service = _service()
        strategy = MagicMock(return_value=[])

        with patch(f"{STRATEGIES}.get_similar_loras", strategy):
            service.similar_loras(target_lora_id="adapter-1", limit=2)
            service.similar_loras(
                target_lora_id="adapter-2",
                limit=3,
                diversify_results=False,
            )

        assert strategy.call_count == 2
        first_call_kwargs = strategy.call_args_list[0].kwargs
        second_call_kwargs = strategy.call_args_list[1].kwargs
        assert first_call_kwargs["diversify_results"] is True
        assert second_call_kwargs["diversify_results"] is False

    def test_prompt_query_records_metrics_and_defaults_weights(self):
        repository = MagicMock()
        registry = MagicMock()
        metrics = MagicMock()
        service = _service(repository, registry, metrics)

        payload = [MagicMock()]
        strategy = MagicMock(return_value=payload)

        with patch(f"{STRATEGIES}.get_recommendations_for_prompt", strategy):
            result = service.recommend_for_prompt(
                prompt="test",
                active_loras=("a",),
                limit=3,
            )

        assert result == payload
        strategy.assert_called_once_with(
            prompt="test",
            active_loras=["a"],
            limit=3,
            style_preference=None,
            weights=DEFAULT_WEIGHTS,
            repository=repository,
            embedder=registry.get_semantic_embedder.return_value,
            device="cpu",
        )
        registry.get_semantic_embedder.assert_called_once()
        metrics.record_query.assert_called_once()

    def test_trigger_query_records_metrics(self):
        repository = MagicMock()
        registry = MagicMock()
        metrics = MagicMock()
        service = _service(repository, registry, metrics)

        strategy = MagicMock(return_value=[])

        with patch(f"{STRATEGIES}.get_recommendations_for_trigger", strategy):
            service.recommend_for_trigger(trigger_query="angel", limit=2)

        kwargs = strategy.call_args.kwargs
        assert kwargs["trigger_query"] == "angel"
        assert kwargs["limit"] == 2
        assert kwargs["repository"] is repository
        assert kwargs["trigger_engine"] is registry.get_trigger_engine.return_value
        metrics.record_query.assert_called_once()

    def test_failed_query_is_still_timed(self):
        metrics = QueryMetrics()
        service = _service(metrics=metrics)
        strategy = MagicMock(side_effect=ValueError("LoRA missing not found"))

        with patch(f"{STRATEGIES}.get_similar_loras", strategy):
            with pytest.raises(ValueError):
                service.similar_loras(target_lora_id="missing")

        assert metrics.total_queries == 1

    def test_prompt_query_generates_embeddings(self):
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

            def compute_prompt_embeddings(
                self, prompt: str, *, device: Optional[str] = None
            ):
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
        registry = MagicMock()
        registry.get_semantic_embedder.return_value = embedder
        metrics = MagicMock()
        service = _service(repository, registry, metrics)

        results = service.recommend_for_prompt(
            prompt="glowing forest",
            active_loras=None,
            limit=1,
            style_preference=None,
            weights={"semantic": 1.0, "artistic": 1.0, "technical": 1.0},
        )

        assert len(results) == 1
        assert embedder.calls == [("glowing forest", "cpu")]
        metrics.record_query.assert_called_once()
