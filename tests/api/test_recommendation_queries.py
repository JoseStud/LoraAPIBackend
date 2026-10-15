"""The recommendation query endpoints keep blocking work off the event loop.

Every repository, model-registry and model call records whether the calling
thread had a running event loop. Under ``TestClient`` the app's loop runs in
its own thread, and FastAPI's threadpool threads have none.
"""

from __future__ import annotations

import asyncio
import pickle
from dataclasses import replace
from typing import Callable

import numpy as np
import pytest

from backend.models import Adapter, LoRAEmbedding
from backend.services import get_service_container_builder
from backend.services.recommendations import (
    EmbeddingService,
    RecommendationRepository,
    RecommendationService,
)
from backend.services.recommendations.encoders import (
    SentenceTransformerProvider,
    TriggerEmbedder,
)
from backend.services.recommendations.triggers import (
    TriggerRecommendationEngine,
    TriggerResolver,
)

Calls = list[tuple[str, bool]]


def _on_event_loop() -> bool:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


def _recorded(calls: Calls, name: str, func: Callable) -> Callable:
    def wrapper(*args, **kwargs):
        calls.append((name, _on_event_loop()))
        return func(*args, **kwargs)

    return wrapper


class _RecordingRepository(RecommendationRepository):
    """Real repository whose public methods record the calling thread."""

    def __init__(self, session, calls: Calls) -> None:
        super().__init__(session)
        for name in dir(RecommendationRepository):
            if not name.startswith("_") and callable(getattr(self, name)):
                setattr(self, name, _recorded(calls, name, getattr(self, name)))


def _vector(*values: float) -> np.ndarray:
    return np.asarray(values, dtype=np.float32)


class _SimilarityEngine:
    def __init__(self, calls: Calls) -> None:
        self._calls = calls
        self.lora_ids: list[str] = []

    def build_similarity_index(self, adapters) -> None:
        self._calls.append(("engine.build_similarity_index", _on_event_loop()))
        self.lora_ids = [adapter.id for adapter in adapters]

    def get_recommendations(self, target, limit, weights, diversify):
        self._calls.append(("engine.get_recommendations", _on_event_loop()))
        return [
            {
                "lora_id": "adapter-2",
                "similarity_score": 0.9,
                "final_score": 0.8,
                "explanation": "Close match",
            },
        ]


class _FeatureExtractor:
    def __init__(self, calls: Calls) -> None:
        self._calls = calls

    def extract_advanced_features(self, adapter):
        self._calls.append(("extract_advanced_features", _on_event_loop()))
        return {
            "semantic_embedding": _vector(1.0, 0.0),
            "artistic_embedding": _vector(1.0, 0.0),
            "technical_embedding": _vector(1.0, 0.0),
        }


class _PromptEmbedder:
    def __init__(self, calls: Calls) -> None:
        self._calls = calls

    def compute_prompt_embeddings(self, prompt, *, device=None):
        self._calls.append(("compute_prompt_embeddings", _on_event_loop()))
        vector = _vector(1.0, 0.0)
        return {"semantic": vector, "artistic": vector, "technical": vector}


class _ModelRegistry:
    """Model registry stub; first access is where real models would load."""

    device = "cpu"
    gpu_enabled = False

    def __init__(self, calls: Calls) -> None:
        trigger_embedder = TriggerEmbedder(
            provider=SentenceTransformerProvider(
                force_fallback=True,
                model_configs={
                    TriggerEmbedder.MODEL_KEY: {"model_name": "", "default_dim": 64},
                },
            ),
        )
        models = {
            "get_recommendation_engine": _SimilarityEngine(calls),
            "get_feature_extractor": _FeatureExtractor(calls),
            "get_semantic_embedder": _PromptEmbedder(calls),
            "get_trigger_engine": TriggerRecommendationEngine(
                resolver=TriggerResolver(),
                embedder=trigger_embedder,
            ),
        }
        for name, model in models.items():
            setattr(self, name, _recorded(calls, name, lambda model=model: model))


@pytest.fixture
def calls(db_session, monkeypatch: pytest.MonkeyPatch) -> Calls:
    """Serve recommendation services that record where each call ran."""
    recorded: Calls = []
    registry = _ModelRegistry(recorded)

    def make_service(session, **_):
        repository = _RecordingRepository(session, recorded)
        return RecommendationService(
            repository=repository,
            embeddings=EmbeddingService(repository, registry),
            model_registry=registry,
        )

    builder = get_service_container_builder()
    monkeypatch.setattr(
        builder,
        "_factories",
        replace(builder._factories, recommendation=make_service),
    )
    monkeypatch.setattr(builder, "_recommendation_gpu_detector", lambda: False)

    # adapter-1 has no embedding yet; adapter-2 has one and a trigger.
    db_session.add(
        Adapter(
            id="adapter-1",
            name="Target",
            file_path="/tmp/adapter-1.safetensors",
            active=True,
        ),
    )
    db_session.add(
        Adapter(
            id="adapter-2",
            name="Angel",
            file_path="/tmp/adapter-2.safetensors",
            active=True,
            triggers=["angel"],
        ),
    )
    db_session.add(
        LoRAEmbedding(
            adapter_id="adapter-2",
            semantic_embedding=pickle.dumps(_vector(1.0, 0.0)),
            artistic_embedding=pickle.dumps(_vector(0.0, 1.0)),
            technical_embedding=pickle.dumps(_vector(1.0, 1.0)),
        ),
    )
    db_session.commit()
    return recorded


def _assert_off_loop(calls: Calls, *expected: str) -> None:
    names = {name for name, _ in calls}
    assert set(expected) <= names, f"missing calls: {set(expected) - names}"
    on_loop = [name for name, loop in calls if loop]
    assert on_loop == [], f"ran on the event loop: {on_loop}"


def test_similar_loras_runs_off_the_event_loop(client, calls: Calls):
    """The ensure-embeddings, index build and candidate lookups leave the loop."""
    response = client.get("/api/v1/recommendations/similar/adapter-1")

    assert response.status_code == 200
    body = response.json()
    assert body["target_lora_id"] == "adapter-1"
    assert [item["lora_id"] for item in body["recommendations"]] == ["adapter-2"]
    _assert_off_loop(
        calls,
        "get_adapter",
        "list_existing_embedding_ids",
        "list_adapters",
        "get_embedding",
        "get_feature_extractor",
        "extract_advanced_features",
        "save_features",
        "get_recommendation_engine",
        "list_active_adapters_with_embeddings",
        "engine.build_similarity_index",
        "engine.get_recommendations",
    )


def test_similar_loras_unknown_adapter_is_404_off_the_loop(client, calls: Calls):
    response = client.get("/api/v1/recommendations/similar/missing")

    assert response.status_code == 404
    assert response.json()["title"] == "LoRA not found"
    _assert_off_loop(calls, "get_adapter")


def test_prompt_recommendations_run_off_the_event_loop(client, calls: Calls):
    response = client.post(
        "/api/v1/recommendations/for-prompt",
        json={"prompt": "glowing forest", "limit": 5},
    )

    assert response.status_code == 200
    assert [item["lora_id"] for item in response.json()["recommendations"]] == [
        "adapter-2",
    ]
    _assert_off_loop(
        calls,
        "get_semantic_embedder",
        "compute_prompt_embeddings",
        "get_active_loras_with_embeddings",
    )


def test_trigger_recommendations_run_off_the_event_loop(client, calls: Calls):
    """The trigger-index rebuild, lookups and fallback query leave the loop."""
    response = client.get(
        "/api/v1/recommendations/by-trigger",
        params={"trigger_query": "angel", "limit": 5},
    )

    assert response.status_code == 200
    items = response.json()["recommendations"]
    assert [item["lora_id"] for item in items] == ["adapter-2", "adapter-1"]
    assert items[0]["metadata"]["trigger"] == "angel"
    _assert_off_loop(
        calls,
        "get_trigger_engine",
        "count_active_adapters",
        "get_active_loras_with_embeddings",
        "get_recent_active_adapters",
    )
