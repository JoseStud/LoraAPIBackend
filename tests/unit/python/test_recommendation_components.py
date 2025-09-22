"""Unit tests for individual recommendation components."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import logging
import sys
import types

import numpy as np
import pytest

# Avoid importing backend.services.__init__ which pulls heavy dependencies.
if "backend.services" not in sys.modules:
    services_stub = types.ModuleType("backend.services")
    services_stub.__path__ = [
        str(Path(__file__).resolve().parents[3] / "backend" / "services")
    ]
    from importlib.machinery import ModuleSpec

    services_stub.__spec__ = ModuleSpec(
        name="backend.services",
        loader=None,
        is_package=True,
    )
    sys.modules["backend.services"] = services_stub

from backend.services.recommendations.components import (
    GPULoRAFeatureExtractor,
    LoRARecommendationEngine,
    LoRASemanticEmbedder,
)
from backend.services.recommendations.components.scoring import ScoreCalculator
from backend.services.recommendations.components.sentiment_style import (
    SentimentStyleAnalyzer,
)
from backend.services.recommendations.components.text_features import KeywordExtractor


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


def test_keyword_extractor_uses_fallback_when_model_missing() -> None:
    """KeyBERT is optional, and the heuristic fallback should still work."""

    extractor = KeywordExtractor(logger=logging.getLogger("test_keyword_extractor"))
    extractor._model = "fallback"
    result = extractor.extract("Beautiful anime hero with vibrant colors and glowing eyes")

    assert result["extracted_keywords"]
    assert all(score <= 1.0 for score in result["keyword_scores"])


def test_keyword_extractor_handles_empty_text() -> None:
    """Empty strings should not raise and must return empty collections."""

    extractor = KeywordExtractor(logger=logging.getLogger("test_keyword_empty"))
    assert extractor.extract("") == {"extracted_keywords": [], "keyword_scores": []}


def test_sentiment_style_analyzer_fallback_positive_signal() -> None:
    """Positive adjectives should trigger the fallback positive sentiment."""

    analyzer = SentimentStyleAnalyzer(device="cpu", logger=logging.getLogger("test_sentiment"))
    analyzer._sentiment_pipeline = "fallback"
    analyzer._style_pipeline = "fallback"
    sentiment = analyzer.analyze_sentiment("This model is amazing and beautiful with perfect lighting")
    style = analyzer.classify_style("Beautiful anime hero with vibrant colors")

    assert sentiment["sentiment_label"] == "POSITIVE"
    assert 0.0 < sentiment["sentiment_score"] <= 1.0
    assert style["predicted_style"] in {"anime", "unknown"}


def test_sentiment_style_analyzer_handles_neutral_text() -> None:
    """Text without keywords should default to neutral and unknown style."""

    analyzer = SentimentStyleAnalyzer(device="cpu", logger=logging.getLogger("test_sentiment_neutral"))
    analyzer._sentiment_pipeline = "fallback"
    analyzer._style_pipeline = "fallback"
    sentiment = analyzer.analyze_sentiment("The quick brown fox jumps over the lazy dog")
    style = analyzer.classify_style("The quick brown fox jumps over the lazy dog")

    assert sentiment["sentiment_label"] == "NEUTRAL"
    assert style["predicted_style"] == "unknown"


def test_score_calculator_defaults_for_missing_stats() -> None:
    """When metadata is missing the calculator should fall back to defaults."""

    calculator = ScoreCalculator(logger=logging.getLogger("test_score_defaults"))
    lora = SimpleNamespace(
        stats=None,
        tags=None,
        sd_version=None,
        author_username=None,
        primary_file_size_kb=None,
        published_at=None,
        created_at=None,
        nsfw_level=None,
        supports_generation=False,
    )

    result = calculator.compute(lora)

    assert result["quality_score"] == 0.5
    assert result["tags_vector"] == [0.0] * 10
    assert result["sd_version_vector"] == [0.0, 0.0, 0.0]
    assert result["supports_generation"] == 0.0


def test_score_calculator_populates_metrics_from_data() -> None:
    """Provide realistic stats to ensure the calculator emits rich metrics."""

    now = datetime.now(timezone.utc)
    calculator = ScoreCalculator(logger=logging.getLogger("test_score_values"))
    lora = SimpleNamespace(
        stats={
            "rating": 4.6,
            "downloadCount": 2000,
            "favoriteCount": 500,
            "commentCount": 50,
        },
        tags=["anime", "portrait"],
        sd_version="SDXL",
        author_username="artist_name",
        primary_file_size_kb=256000,
        published_at=now,
        created_at=now,
        nsfw_level=4,
        supports_generation=True,
    )

    result = calculator.compute(lora)

    assert result["quality_score"] >= 0.0
    assert result["sd_version_vector"] == [0.0, 0.0, 1.0]
    assert result["supports_generation"] == 1.0
    assert result["nsfw_level_normalized"] == pytest.approx(0.4)


def test_feature_extractor_orchestrates_helpers() -> None:
    """The feature extractor should orchestrate helpers in a predictable order."""

    embeddings = {
        "adapter": {
            "semantic": np.ones(4, dtype=np.float32),
            "artistic": np.ones(3, dtype=np.float32),
            "technical": np.ones(2, dtype=np.float32),
        }
    }
    semantic_embedder = _SemanticEmbedderStub(embeddings)

    class _KeywordExtractorFake:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def extract(self, text: str) -> dict[str, list[float]]:
            self.calls.append(text)
            return {"extracted_keywords": ["hero"], "keyword_scores": [0.8]}

    class _SentimentStyleFake:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def analyze_sentiment(self, text: str) -> dict[str, float | str]:
            self.calls.append(f"sentiment:{text}")
            return {"sentiment_label": "POSITIVE", "sentiment_score": 0.9}

        def classify_style(self, text: str) -> dict[str, float | str]:
            self.calls.append(f"style:{text}")
            return {"predicted_style": "anime", "style_confidence": 0.7}

    class _ScoreCalculatorFake:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def compute(self, lora: SimpleNamespace) -> dict[str, float | list[float]]:
            self.calls.append(lora.id)
            return {
                "quality_score": 0.75,
                "tags_vector": [1.0] * 10,
                "sd_version_vector": [1.0, 0.0, 0.0],
                "author_vector": 0.5,
                "community_engagement": 0.2,
                "popularity_score": 0.3,
                "file_size_normalized": 0.4,
                "recency_score": 0.5,
                "maturity_score": 0.6,
                "nsfw_level_normalized": 0.0,
                "supports_generation": 1.0,
                "sd_compatibility_score": 0.8,
                "user_activation_frequency": 0.0,
                "user_success_rate": 0.5,
                "recent_usage_trend": 0.0,
            }

    keyword_fake = _KeywordExtractorFake()
    sentiment_fake = _SentimentStyleFake()
    score_fake = _ScoreCalculatorFake()

    extractor = GPULoRAFeatureExtractor(
        device="cpu",
        semantic_embedder=semantic_embedder,
        keyword_extractor=keyword_fake,
        sentiment_style_analyzer=sentiment_fake,
        score_calculator=score_fake,
        logger=logging.getLogger("test_feature_extractor"),
    )

    lora = SimpleNamespace(
        id="adapter",
        description="Beautiful anime hero with vibrant colors",
        stats=None,
        tags=None,
        sd_version="SD1.5",
        author_username="tester",
        primary_file_size_kb=None,
        published_at=None,
        created_at=None,
        nsfw_level=0,
        supports_generation=True,
    )

    features = extractor.extract_advanced_features(lora)

    assert features["semantic_embedding"].shape == (4,)
    assert features["artistic_embedding"].shape == (3,)
    assert features["technical_embedding"].shape == (2,)
    assert features["extracted_keywords"] == ["hero"]
    assert features["sentiment_label"] == "POSITIVE"
    assert features["predicted_style"] == "anime"
    assert features["quality_score"] == 0.75

    assert keyword_fake.calls == [lora.description]
    assert sentiment_fake.calls == [f"sentiment:{lora.description}", f"style:{lora.description}"]
    assert score_fake.calls == ["adapter"]


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
