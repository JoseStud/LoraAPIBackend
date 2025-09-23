"""Feature extraction utilities for LoRA recommendations."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from .embedder import LoRASemanticEmbedder
from .interfaces import FeatureExtractorProtocol, SemanticEmbedderProtocol
from .scoring import ScoreCalculator, ScoreCalculatorProtocol
from .sentiment_style import (
    SentimentStyleAnalyzer,
    SentimentStyleAnalyzerProtocol,
)
from .text_features import KeywordExtractor, KeywordExtractorProtocol


class GPULoRAFeatureExtractor(FeatureExtractorProtocol):
    """GPU-accelerated feature extraction with advanced NLP."""

    def __init__(
        self,
        *,
        device: str = "cuda",
        semantic_embedder: SemanticEmbedderProtocol | None = None,
        keyword_extractor: KeywordExtractorProtocol | None = None,
        sentiment_style_analyzer: SentimentStyleAnalyzerProtocol | None = None,
        score_calculator: ScoreCalculatorProtocol | None = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Initialize feature extractor."""

        self.device = device
        self._logger = logger or logging.getLogger(__name__)
        self.semantic_embedder = semantic_embedder or LoRASemanticEmbedder(
            device=device,
            logger=self._logger,
        )

        self.keyword_extractor = keyword_extractor or KeywordExtractor(
            logger=self._logger,
        )
        self.sentiment_style_analyzer = (
            sentiment_style_analyzer
            or SentimentStyleAnalyzer(device=device, logger=self._logger)
        )
        self.score_calculator = score_calculator or ScoreCalculator(
            logger=self._logger,
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

        description = getattr(lora, "description", "") or ""
        if description:
            features.update(self.keyword_extractor.extract(description))
            features.update(
                self.sentiment_style_analyzer.analyze_sentiment(description),
            )
            features.update(self.sentiment_style_analyzer.classify_style(description))

        features.update(self.score_calculator.compute(lora))

        return features
