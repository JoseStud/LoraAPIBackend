"""Unit tests for the GPU feature extractor."""

from __future__ import annotations

import dataclasses
from typing import Any, Dict, Iterable, List

import numpy as np

from backend.services.recommendations.components.feature_extractor import (
    GPULoRAFeatureExtractor,
)
from backend.services.recommendations.components.text_payload_builder import (
    MultiModalTextPayloadBuilder,
)
from backend.services.recommendations.components.trigger_processing import (
    TriggerCandidate,
    TriggerResolution,
)


@dataclasses.dataclass
class _Adapter:
    """Test double that mimics adapter metadata."""

    trained_words: tuple[str, ...] = ("angel", "luminescent glow")
    triggers: tuple[str, ...] = ("angel",)
    activation_text: str | None = "heavenly envoy"
    tags: tuple[str, ...] = ("fantasy", "angel", "portrait")
    archetype: str | None = "celestial guardian"
    stats: Dict[str, Any] | None = None
    description: str | None = None


class _GuardAdapter(_Adapter):
    """Adapter that fails if ``description`` is accessed."""

    @property
    def description(self) -> str:  # type: ignore[override]
        raise AssertionError("description must not be read")

    @description.setter
    def description(self, value: str | None) -> None:  # type: ignore[override]
        if value not in (None, ""):
            raise AssertionError("description should not be set")


class _RecordingEmbedder:
    """Stub embedder that records payloads and returns constant vectors."""

    def __init__(self) -> None:
        self.payloads: List[Dict[str, str]] = []
        self.builder = MultiModalTextPayloadBuilder()

    def create_multi_modal_embedding(self, lora: Any) -> Dict[str, Any]:
        payload = self.builder.build_payload(lora)
        self.payloads.append(payload)
        return {
            "semantic": np.asarray([0.1, 0.2, 0.3], dtype=np.float32),
            "artistic": np.asarray([0.4, 0.5, 0.6], dtype=np.float32),
            "technical": np.asarray([0.7, 0.8, 0.9], dtype=np.float32),
        }


class _StaticScoreCalculator:
    def compute(self, lora: Any) -> Dict[str, Any]:  # noqa: D401 - simple stub
        return {"quality_score": 0.75}


class _StaticTriggerResolver:
    def __init__(self) -> None:
        self.last_candidates: Iterable[TriggerCandidate] | None = None

    def build_candidates_from_adapter(
        self,
        triggers: Iterable[str],
        trained_words: Iterable[str],
        activation_text: str | None,
    ) -> List[TriggerCandidate]:
        candidates = [
            TriggerCandidate(phrase=phrase, source="trigger") for phrase in triggers
        ]
        candidates.extend(
            TriggerCandidate(phrase=word, source="trained_word")
            for word in trained_words
        )
        self.last_candidates = candidates
        return candidates

    def resolve(self, candidates: Iterable[TriggerCandidate]) -> TriggerResolution:
        canonical = [candidate.phrase for candidate in candidates]
        return TriggerResolution(
            canonical=canonical,
            alias_map={phrase: phrase for phrase in canonical},
            confidence={phrase: 0.5 for phrase in canonical},
            sources={phrase: ["test"] for phrase in canonical},
        )


class _StaticTriggerEmbedder:
    def encode(self, phrases: Iterable[str]) -> np.ndarray:  # noqa: D401 - stub
        phrases = list(phrases)
        return np.asarray([[float(index)] for index, _ in enumerate(phrases)], dtype=float)


class TestGPULoRAFeatureExtractor:
    """Tests enforcing that descriptions play no role in feature extraction."""

    def setup_method(self) -> None:
        self.embedder = _RecordingEmbedder()
        self.resolver = _StaticTriggerResolver()
        self.embedder_logger_extractor = GPULoRAFeatureExtractor(
            semantic_embedder=self.embedder,
            score_calculator=_StaticScoreCalculator(),
            trigger_resolver=self.resolver,
            trigger_embedder=_StaticTriggerEmbedder(),
        )

    def test_description_is_never_read(self) -> None:
        adapter = _GuardAdapter()

        features = self.embedder_logger_extractor.extract_advanced_features(adapter)

        assert np.allclose(features["semantic_embedding"], [0.1, 0.2, 0.3])
        assert features["trigger_embeddings"] == [[0.0], [1.0], [2.0]]

    def test_description_content_does_not_change_features(self) -> None:
        adapter_without_description = _Adapter(description=None)
        adapter_with_description = _Adapter(description="ornate gilded wings")

        features_without_description = self.embedder_logger_extractor.extract_advanced_features(
            adapter_without_description
        )
        features_with_description = self.embedder_logger_extractor.extract_advanced_features(
            adapter_with_description
        )

        assert np.array_equal(
            features_with_description["semantic_embedding"],
            features_without_description["semantic_embedding"],
        )
        assert np.array_equal(
            features_with_description["artistic_embedding"],
            features_without_description["artistic_embedding"],
        )
        assert np.array_equal(
            features_with_description["technical_embedding"],
            features_without_description["technical_embedding"],
        )
        assert features_with_description["trigger_embeddings"] == features_without_description[
            "trigger_embeddings"
        ]
        assert (
            features_with_description["normalized_triggers"]
            == features_without_description["normalized_triggers"]
        )
        assert features_with_description["trigger_metadata"] == features_without_description[
            "trigger_metadata"
        ]
        assert features_with_description["quality_score"] == features_without_description[
            "quality_score"
        ]
        assert len(self.embedder.payloads) == 2
        assert all(
            "ornate" not in payload["semantic"] and "ornate" not in payload["artistic"]
            for payload in self.embedder.payloads
        )

