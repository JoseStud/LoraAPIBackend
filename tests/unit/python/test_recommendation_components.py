"""Unit tests for individual recommendation components."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import logging

import numpy as np
import pytest

from backend.services.recommendations.components import (
    GPULoRAFeatureExtractor,
    LoRARecommendationEngine,
    LoRASemanticEmbedder,
)


def test_fallback_embedder_generates_normalized_vectors() -> None:
    """Ensure the fallback encoder produces deterministic, normalized vectors."""

    logger = logging.getLogger("test_fallback_embedder")
    embedder = LoRASemanticEmbedder(
        device="cpu",
        force_fallback=True,
        logger=logger,
    )

    vector = embedder.primary_model.encode("Glowing anime hero", convert_to_numpy=True)
    assert vector.shape == (embedder.SEMANTIC_DIM,)
    assert np.isclose(np.linalg.norm(vector), 1.0)

    zero_vector = embedder.primary_model.encode("", convert_to_numpy=True)
    assert np.allclose(zero_vector, 0.0)


class _SemanticEmbedderStub:
    """Stub semantic embedder for feature extractor and engine tests."""

    def __init__(self, embeddings_by_id: dict[str, dict[str, np.ndarray]]):
        self._embeddings_by_id = embeddings_by_id

    def create_multi_modal_embedding(self, lora: SimpleNamespace) -> dict[str, np.ndarray]:
        return self._embeddings_by_id[lora.id]

    def batch_encode_collection(self, loras):
        semantic = []
        artistic = []
        technical = []
        for lora in loras:
            embedding = self._embeddings_by_id[lora.id]
            semantic.append(embedding["semantic"])
            artistic.append(embedding["artistic"])
            technical.append(embedding["technical"])
        return {
            "semantic": np.asarray(semantic, dtype=np.float32),
            "artistic": np.asarray(artistic, dtype=np.float32),
            "technical": np.asarray(technical, dtype=np.float32),
        }


class _FeatureExtractorStub:
    """Feature extractor that only exposes the semantic embedder."""

    def __init__(self, semantic_embedder: _SemanticEmbedderStub):
        self.semantic_embedder = semantic_embedder


def test_feature_extractor_uses_fallback_paths() -> None:
    """Ensure fallback feature extraction logic populates expected metadata."""

    embeddings = {
        "adapter": {
            "semantic": np.ones(4, dtype=np.float32),
            "artistic": np.ones(3, dtype=np.float32),
            "technical": np.ones(2, dtype=np.float32),
        }
    }
    semantic_embedder = _SemanticEmbedderStub(embeddings)
    extractor = GPULoRAFeatureExtractor(
        device="cpu",
        semantic_embedder=semantic_embedder,
        logger=logging.getLogger("test_feature_extractor"),
    )

    extractor._keyword_extractor = "fallback"
    extractor._sentiment_analyzer = "fallback"
    extractor._style_classifier = "fallback"
    extractor._load_advanced_models = lambda: None

    lora = SimpleNamespace(
        id="adapter",
        description="Beautiful anime character with vibrant colors",
        tags=["anime", "style"],
        trained_words=["hero"],
        triggers=["hero"],
        activation_text=None,
        archetype=None,
        stats={
            "downloadCount": 25,
            "favoriteCount": 5,
            "rating": 4.2,
            "commentCount": 3,
        },
        primary_file_size_kb=51200,
        published_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        nsfw_level=0,
        supports_generation=True,
        sd_version="SD1.5",
        author_username="test_author",
    )

    features = extractor.extract_advanced_features(lora)

    assert features["semantic_embedding"].shape == (4,)
    assert features["artistic_embedding"].shape == (3,)
    assert features["technical_embedding"].shape == (2,)
    assert features["extracted_keywords"]
    assert features["sentiment_label"] == "POSITIVE"
    assert features["predicted_style"] != ""
    assert len(features["tags_vector"]) == 10
    assert features["sd_compatibility_score"] == pytest.approx(0.8)


def test_recommendation_engine_applies_boosts() -> None:
    """Verify the engine computes boosted scores for compatible LoRAs."""

    now = datetime.now(timezone.utc)

    embeddings = {
        "target": {
            "semantic": np.array([1.0, 0.0], dtype=np.float32),
            "artistic": np.array([1.0, 0.0], dtype=np.float32),
            "technical": np.array([1.0, 0.0], dtype=np.float32),
        },
        "candidate": {
            "semantic": np.array([1.0, 0.0], dtype=np.float32),
            "artistic": np.array([1.0, 0.0], dtype=np.float32),
            "technical": np.array([1.0, 0.0], dtype=np.float32),
        },
        "other": {
            "semantic": np.array([0.0, 1.0], dtype=np.float32),
            "artistic": np.array([0.0, 1.0], dtype=np.float32),
            "technical": np.array([0.0, 1.0], dtype=np.float32),
        },
    }

    semantic_embedder = _SemanticEmbedderStub(embeddings)
    feature_extractor = _FeatureExtractorStub(semantic_embedder)
    engine = LoRARecommendationEngine(
        feature_extractor,
        device="cpu",
        logger=logging.getLogger("test_engine"),
    )

    target = SimpleNamespace(
        id="target",
        description="Brave anime hero",
        tags=["hero", "anime"],
        sd_version="SD1.5",
        stats=None,
        published_at=now,
    )

    candidate = SimpleNamespace(
        id="candidate",
        description="Brave anime hero with vibrant colors",
        tags=["hero", "anime"],
        sd_version="SD1.5",
        stats={
            "rating": 4.6,
            "downloadCount": 20000,
            "favoriteCount": 500,
            "commentCount": 50,
        },
        published_at=now,
    )

    other = SimpleNamespace(
        id="other",
        description="Landscape study",
        tags=["landscape"],
        sd_version="SDXL",
        stats={
            "rating": 4.9,
            "downloadCount": 50000,
            "favoriteCount": 800,
            "commentCount": 120,
        },
        published_at=now,
    )

    engine.build_similarity_index([target, candidate, other])
    recommendations = engine.get_recommendations(target, n_recommendations=2)

    assert recommendations
    assert recommendations[0]["lora_id"] == "candidate"
    assert recommendations[0]["final_score"] > recommendations[0]["similarity_score"]
    assert recommendations[0]["final_score"] == pytest.approx(1.25, rel=1e-6)
    assert all(rec["lora_id"] != "other" for rec in recommendations)
