"""Feature extraction utilities for LoRA recommendations."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from .embedder import LoRASemanticEmbedder
from .interfaces import FeatureExtractorProtocol, SemanticEmbedderProtocol
from .scoring import ScoreCalculator, ScoreCalculatorProtocol
from .trigger_embedder import TriggerEmbedder
from .trigger_processing import TriggerResolver


class GPULoRAFeatureExtractor(FeatureExtractorProtocol):
    """GPU-accelerated feature extraction with advanced NLP."""

    def __init__(
        self,
        *,
        device: str = "cuda",
        semantic_embedder: SemanticEmbedderProtocol | None = None,
        score_calculator: ScoreCalculatorProtocol | None = None,
        trigger_resolver: TriggerResolver | None = None,
        trigger_embedder: TriggerEmbedder | None = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Initialize feature extractor."""
        self.device = device
        self._logger = logger or logging.getLogger(__name__)
        self.semantic_embedder = semantic_embedder or LoRASemanticEmbedder(
            device=device,
            logger=self._logger,
        )
        self.score_calculator = score_calculator or ScoreCalculator(
            logger=self._logger,
        )
        self.trigger_resolver = trigger_resolver or TriggerResolver()
        self.trigger_embedder = trigger_embedder or TriggerEmbedder(
            device="cpu", logger=self._logger
        )

    def extract_advanced_features(self, lora: Any) -> Dict[str, Any]:
        """Extract comprehensive features using available models."""
        features: Dict[str, Any] = {}

        embeddings = self.semantic_embedder.create_multi_modal_embedding(lora)
        features.update(
            {
                "semantic_embedding": embeddings["semantic"],
                "artistic_embedding": embeddings["artistic"],
                "technical_embedding": embeddings["technical"],
            },
        )

        features.update(self.score_calculator.compute(lora))

        trigger_candidates = self.trigger_resolver.build_candidates_from_adapter(
            getattr(lora, "triggers", []) or [],
            getattr(lora, "trained_words", []) or [],
            getattr(lora, "activation_text", None),
        )
        trigger_resolution = self.trigger_resolver.resolve(trigger_candidates)
        if trigger_resolution.canonical:
            trigger_vectors = self.trigger_embedder.encode(trigger_resolution.canonical)
            features.update(
                {
                    "normalized_triggers": trigger_resolution.canonical,
                    "trigger_aliases": trigger_resolution.alias_map,
                    "trigger_metadata": {
                        "confidence": trigger_resolution.confidence,
                        "sources": trigger_resolution.sources,
                    },
                    "trigger_embeddings": [
                        vector.astype(float).tolist() for vector in trigger_vectors
                    ],
                }
            )

        return features
