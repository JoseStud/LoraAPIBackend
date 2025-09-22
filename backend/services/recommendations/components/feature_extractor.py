"""Feature extraction utilities for LoRA recommendations."""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from .embedder import LoRASemanticEmbedder
from .interfaces import FeatureExtractorProtocol, SemanticEmbedderProtocol


class GPULoRAFeatureExtractor(FeatureExtractorProtocol):
    """GPU-accelerated feature extraction with advanced NLP."""

    def __init__(
        self,
        *,
        device: str = "cuda",
        semantic_embedder: SemanticEmbedderProtocol | None = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Initialize feature extractor."""

        self.device = device
        self._logger = logger or logging.getLogger(__name__)
        self.semantic_embedder = semantic_embedder or LoRASemanticEmbedder(
            device=device,
            logger=self._logger,
        )

        self._keyword_extractor: Any | None = None
        self._sentiment_analyzer: Any | None = None
        self._style_classifier: Any | None = None

    def _load_advanced_models(self) -> None:
        """Load advanced NLP models if available."""
        if self._keyword_extractor is None:
            try:
                from keybert import KeyBERT

                self._keyword_extractor = KeyBERT(
                    model="sentence-transformers/all-mpnet-base-v2",
                )
                self._logger.info("KeyBERT loaded for keyword extraction")
            except ImportError:
                self._logger.debug(
                    "KeyBERT not available, using fallback keyword extraction",
                )
                self._keyword_extractor = "fallback"

        if self._sentiment_analyzer is None:
            try:
                from transformers import pipeline

                self._sentiment_analyzer = pipeline(
                    "sentiment-analysis",
                    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                    device=0 if self.device == "cuda" else -1,
                )
                self._logger.info("Sentiment analyzer loaded")
            except ImportError:
                self._logger.debug(
                    "Transformers not available, using fallback sentiment analysis",
                )
                self._sentiment_analyzer = "fallback"

        if self._style_classifier is None:
            try:
                from transformers import pipeline

                self._style_classifier = pipeline(
                    "zero-shot-classification",
                    model="facebook/bart-large-mnli",
                    device=0 if self.device == "cuda" else -1,
                )
                self._logger.info("Style classifier loaded")
            except ImportError:
                self._logger.debug(
                    "Style classifier not available, using fallback classification",
                )
                self._style_classifier = "fallback"

    def extract_advanced_features(self, lora: Any) -> Dict[str, Any]:
        """Extract comprehensive features using available models."""
        features: Dict[str, Any] = {}

        embeddings = self.semantic_embedder.create_multi_modal_embedding(lora)
        features.update(
            {
                "semantic_embedding": embeddings["semantic"],
                "artistic_embedding": embeddings["artistic"],
                "technical_embedding": embeddings["technical"],
            }
        )

        self._load_advanced_models()

        description = getattr(lora, "description", "") or ""
        if description:
            if self._keyword_extractor != "fallback":
                try:
                    keywords = self._keyword_extractor.extract_keywords(
                        description,
                        keyphrase_ngram_range=(1, 3),
                        stop_words="english",
                        top_k=10,
                    )
                    features["extracted_keywords"] = [kw[0] for kw in keywords]
                    features["keyword_scores"] = [kw[1] for kw in keywords]
                except Exception:
                    features.update(self._fallback_keyword_extraction(description))
            else:
                features.update(self._fallback_keyword_extraction(description))

            if self._sentiment_analyzer != "fallback":
                try:
                    sentiment = self._sentiment_analyzer(description[:512])
                    features["sentiment_label"] = sentiment[0]["label"]
                    features["sentiment_score"] = sentiment[0]["score"]
                except Exception:
                    features.update(self._fallback_sentiment_analysis(description))
            else:
                features.update(self._fallback_sentiment_analysis(description))

            if self._style_classifier != "fallback":
                try:
                    art_styles = [
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
                    style_result = self._style_classifier(description[:512], art_styles)
                    features["predicted_style"] = style_result["labels"][0]
                    features["style_confidence"] = style_result["scores"][0]
                except Exception:
                    features.update(self._fallback_style_classification(description))
            else:
                features.update(self._fallback_style_classification(description))

        features.update(
            {
                "tags_vector": self._encode_tags_advanced(getattr(lora, "tags", None)),
                "sd_version_vector": self._encode_sd_version(
                    getattr(lora, "sd_version", None)
                ),
                "author_vector": self._encode_author_advanced(
                    getattr(lora, "author_username", None)
                ),
                "quality_score": self._calculate_enhanced_quality_score(
                    getattr(lora, "stats", None)
                ),
                "popularity_score": self._calculate_popularity_score(
                    getattr(lora, "stats", None)
                ),
                "community_engagement": self._calculate_engagement_score(
                    getattr(lora, "stats", None)
                ),
                "file_size_normalized": self._normalize_file_size(
                    getattr(lora, "primary_file_size_kb", None)
                ),
                "recency_score": self._calculate_recency_score(
                    getattr(lora, "published_at", None)
                ),
                "maturity_score": self._calculate_maturity_score(
                    getattr(lora, "created_at", None)
                ),
                "nsfw_level_normalized": (
                    getattr(lora, "nsfw_level", 0) / 10.0
                    if getattr(lora, "nsfw_level", None)
                    else 0.0
                ),
                "supports_generation": float(
                    bool(getattr(lora, "supports_generation", False))
                ),
                "sd_compatibility_score": self._calculate_sd_compatibility(
                    getattr(lora, "sd_version", None)
                ),
                "user_activation_frequency": 0.0,
                "user_success_rate": 0.5,
                "recent_usage_trend": 0.0,
            }
        )

        return features

    def _fallback_keyword_extraction(self, text: str) -> Dict[str, Any]:
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

    def _fallback_sentiment_analysis(self, text: str) -> Dict[str, Any]:
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

    def _fallback_style_classification(self, text: str) -> Dict[str, Any]:
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

    def _encode_tags_advanced(self, tags: Optional[Sequence[str]]) -> List[float]:
        if not tags:
            return [0.0] * 10

        common_categories = [
            "character",
            "style",
            "anime",
            "realistic",
            "fantasy",
            "portrait",
            "landscape",
            "nsfw",
            "safe",
            "concept",
        ]

        vector: List[float] = []
        for category in common_categories:
            score = sum(1 for tag in tags if category in tag.lower())
            vector.append(min(score / len(tags), 1.0))

        return vector

    def _encode_sd_version(self, sd_version: Optional[str]) -> List[float]:
        if not sd_version:
            return [0.0, 0.0, 0.0]

        version_lower = sd_version.lower()
        if "xl" in version_lower or "sdxl" in version_lower:
            return [0.0, 0.0, 1.0]
        if "2." in version_lower or "sd2" in version_lower:
            return [0.0, 1.0, 0.0]
        return [1.0, 0.0, 0.0]

    def _encode_author_advanced(self, author: Optional[str]) -> float:
        if not author:
            return 0.0
        return min(len(author) / 20.0, 1.0)

    def _calculate_enhanced_quality_score(self, stats: Optional[Dict[str, Any]]) -> float:
        if not stats:
            return 0.5

        rating = stats.get("rating", 0)
        download_count = stats.get("downloadCount", 0)
        favorite_count = stats.get("favoriteCount", 0)

        quality = 0.0
        if rating > 0:
            quality += (rating / 5.0) * 0.6

        if download_count > 0:
            popularity = min(np.log10(download_count + 1) / 5.0, 1.0)
            quality += popularity * 0.3

        if favorite_count > 0:
            favorites = min(np.log10(favorite_count + 1) / 3.0, 1.0)
            quality += favorites * 0.1

        return min(quality, 1.0)

    def _calculate_popularity_score(self, stats: Optional[Dict[str, Any]]) -> float:
        if not stats:
            return 0.0
        downloads = stats.get("downloadCount", 0)
        return min(np.log10(downloads + 1) / 6.0, 1.0)

    def _calculate_engagement_score(self, stats: Optional[Dict[str, Any]]) -> float:
        if not stats:
            return 0.0
        comments = stats.get("commentCount", 0)
        favorites = stats.get("favoriteCount", 0)
        engagement = comments * 0.6 + favorites * 0.4
        return min(np.log10(engagement + 1) / 3.0, 1.0)

    def _normalize_file_size(self, size_kb: Optional[int]) -> float:
        if not size_kb:
            return 0.5
        return min(size_kb / (500 * 1024), 1.0)

    def _calculate_recency_score(self, published_at: Any) -> float:
        if not published_at:
            return 0.0
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            if getattr(published_at, "tzinfo", None) is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            days_old = (now - published_at).days
            return max(0.0, 1.0 - (days_old / 365.0))
        except Exception:
            return 0.5

    def _calculate_maturity_score(self, created_at: Any) -> float:
        if not created_at:
            return 0.0
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            if getattr(created_at, "tzinfo", None) is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            days_old = (now - created_at).days
            return min(days_old / 180.0, 1.0)
        except Exception:
            return 0.5

    def _calculate_sd_compatibility(self, sd_version: Optional[str]) -> float:
        if not sd_version:
            return 0.5

        version_lower = sd_version.lower()
        if "xl" in version_lower or "sdxl" in version_lower:
            return 1.0
        if "2." in version_lower:
            return 0.7
        return 0.8
