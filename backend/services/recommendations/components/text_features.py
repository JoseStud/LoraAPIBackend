"""Keyword extraction helpers for recommendation features."""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Protocol, Sequence


class KeywordExtractorProtocol(Protocol):
    """Minimal protocol for keyword extraction helpers."""

    def extract(
        self, text: str
    ) -> Dict[str, Sequence[Any]]:  # pragma: no cover - interface
        """Return keyword strings and their scores for the provided text."""


class KeywordExtractor(KeywordExtractorProtocol):
    """Keyword extractor that prefers KeyBERT but falls back to heuristics."""

    def __init__(self, *, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger(__name__)
        self._model: Any | None = None

    def extract(self, text: str) -> Dict[str, List[Any]]:
        """Extract keywords for *text*, applying a robust fallback if necessary."""
        if not text:
            return {"extracted_keywords": [], "keyword_scores": []}

        self._ensure_model()
        if self._model == "fallback":
            return self._fallback(text)

        try:
            keywords = self._model.extract_keywords(
                text,
                keyphrase_ngram_range=(1, 3),
                stop_words="english",
                top_k=10,
            )
            return {
                "extracted_keywords": [kw[0] for kw in keywords],
                "keyword_scores": [kw[1] for kw in keywords],
            }
        except Exception:  # pragma: no cover - defensive branch
            self._logger.debug(
                "Falling back to heuristic keyword extraction", exc_info=True
            )
            return self._fallback(text)

    def _ensure_model(self) -> None:
        if self._model is not None:
            return

        try:
            from keybert import KeyBERT

            self._model = KeyBERT(model="sentence-transformers/all-mpnet-base-v2")
            self._logger.info("KeyBERT loaded for keyword extraction")
        except ImportError:
            self._logger.debug("KeyBERT unavailable, using keyword fallback heuristics")
            self._model = "fallback"

    def _fallback(self, text: str) -> Dict[str, List[Any]]:
        words = re.findall(r"\b\w+\b", text.lower())
        word_freq: Dict[str, int] = {}
        for word in words:
            if len(word) > 3:
                word_freq[word] = word_freq.get(word, 0) + 1

        top_keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]

        return {
            "extracted_keywords": [kw[0] for kw in top_keywords],
            "keyword_scores": [kw[1] / len(words) for kw in top_keywords]
            if words
            else [],
        }


__all__ = ["KeywordExtractor", "KeywordExtractorProtocol"]
