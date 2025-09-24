"""Sentiment and style analysis helpers for recommendation features."""

from __future__ import annotations

import logging
from typing import Any, Dict, Protocol


class SentimentStyleAnalyzerProtocol(Protocol):
    """Minimal protocol for combined sentiment and style analysis."""

    def analyze_sentiment(
        self, text: str
    ) -> Dict[str, Any]:  # pragma: no cover - interface
        """Return sentiment metadata for the supplied text."""

    def classify_style(
        self, text: str
    ) -> Dict[str, Any]:  # pragma: no cover - interface
        """Return artistic style predictions for the supplied text."""


class SentimentStyleAnalyzer(SentimentStyleAnalyzerProtocol):
    """Analyzer that tries to use transformers pipelines with robust fallbacks."""

    _ART_STYLES = [
        "anime",
        "realistic",
        "cartoon",
        "abstract",
        "photographic",
        "digital art",
        "painting",
        "sketch",
        "3D render",
        "pixel art",
    ]

    def __init__(
        self, *, device: str = "cuda", logger: logging.Logger | None = None
    ) -> None:
        self._device = device
        self._logger = logger or logging.getLogger(__name__)
        self._sentiment_pipeline: Any | None = None
        self._style_pipeline: Any | None = None

    def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        if not text:
            return {"sentiment_label": "NEUTRAL", "sentiment_score": 0.5}

        self._ensure_sentiment_pipeline()
        if self._sentiment_pipeline == "fallback":
            return self._fallback_sentiment(text)

        try:
            sentiment = self._sentiment_pipeline(text[:512])
            return {
                "sentiment_label": sentiment[0]["label"],
                "sentiment_score": sentiment[0]["score"],
            }
        except Exception:  # pragma: no cover - defensive branch
            self._logger.debug(
                "Falling back to heuristic sentiment analysis", exc_info=True
            )
            return self._fallback_sentiment(text)

    def classify_style(self, text: str) -> Dict[str, Any]:
        if not text:
            return {"predicted_style": "unknown", "style_confidence": 0.0}

        self._ensure_style_pipeline()
        if self._style_pipeline == "fallback":
            return self._fallback_style(text)

        try:
            style_result = self._style_pipeline(text[:512], self._ART_STYLES)
            return {
                "predicted_style": style_result["labels"][0],
                "style_confidence": style_result["scores"][0],
            }
        except Exception:  # pragma: no cover - defensive branch
            self._logger.debug(
                "Falling back to heuristic style classification", exc_info=True
            )
            return self._fallback_style(text)

    def _ensure_sentiment_pipeline(self) -> None:
        if self._sentiment_pipeline is not None:
            return

        try:
            from transformers import pipeline

            self._sentiment_pipeline = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                device=0 if self._device == "cuda" else -1,
            )
            self._logger.info("Sentiment analysis pipeline loaded")
        except ImportError:
            self._logger.debug(
                "Transformers unavailable, using sentiment fallback heuristics"
            )
            self._sentiment_pipeline = "fallback"

    def _ensure_style_pipeline(self) -> None:
        if self._style_pipeline is not None:
            return

        try:
            from transformers import pipeline

            self._style_pipeline = pipeline(
                "zero-shot-classification",
                model="facebook/bart-large-mnli",
                device=0 if self._device == "cuda" else -1,
            )
            self._logger.info("Style classification pipeline loaded")
        except ImportError:
            self._logger.debug(
                "Transformers unavailable, using style fallback heuristics"
            )
            self._style_pipeline = "fallback"

    def _fallback_sentiment(self, text: str) -> Dict[str, Any]:
        positive_words = [
            "good",
            "great",
            "excellent",
            "amazing",
            "beautiful",
            "perfect",
        ]
        negative_words = [
            "bad",
            "terrible",
            "awful",
            "horrible",
            "ugly",
            "poor",
        ]

        text_lower = text.lower()
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)

        if pos_count > neg_count:
            return {"sentiment_label": "POSITIVE", "sentiment_score": 0.7}
        if neg_count > pos_count:
            return {"sentiment_label": "NEGATIVE", "sentiment_score": 0.7}
        return {"sentiment_label": "NEUTRAL", "sentiment_score": 0.5}

    def _fallback_style(self, text: str) -> Dict[str, Any]:
        style_keywords = {
            "anime": ["anime", "manga", "japanese", "kawaii"],
            "realistic": ["realistic", "photorealistic", "photo", "real"],
            "cartoon": ["cartoon", "comic", "toon"],
            "digital art": ["digital", "cg", "computer"],
            "painting": ["painting", "paint", "oil", "watercolor"],
        }

        text_lower = text.lower()
        style_scores: Dict[str, int] = {}

        for style, keywords in style_keywords.items():
            score = sum(1 for keyword in keywords if keyword in text_lower)
            if score > 0:
                style_scores[style] = score

        if style_scores:
            best_style = max(style_scores, key=style_scores.get)
            confidence = style_scores[best_style] / max(len(text.split()), 1)
            return {
                "predicted_style": best_style,
                "style_confidence": min(confidence, 1.0),
            }
        return {"predicted_style": "unknown", "style_confidence": 0.0}


__all__ = ["SentimentStyleAnalyzer", "SentimentStyleAnalyzerProtocol"]
