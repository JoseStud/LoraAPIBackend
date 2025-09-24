"""Numeric scoring helpers for recommendation feature extraction."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Protocol, Sequence

import numpy as np


class ScoreCalculatorProtocol(Protocol):
    """Minimal protocol for numeric feature calculation helpers."""

    def compute(self, lora: Any) -> Dict[str, Any]:  # pragma: no cover - interface
        """Return the derived numeric metrics for the provided LoRA object."""


class ScoreCalculator(ScoreCalculatorProtocol):
    """Calculate derived metrics from LoRA metadata and statistics."""

    _COMMON_TAG_CATEGORIES = [
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

    def __init__(self, *, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger(__name__)

    def compute(self, lora: Any) -> Dict[str, Any]:
        stats = getattr(lora, "stats", None)
        tags = getattr(lora, "tags", None)
        sd_version = getattr(lora, "sd_version", None)
        author = getattr(lora, "author_username", None)

        return {
            "tags_vector": self._encode_tags(tags),
            "sd_version_vector": self._encode_sd_version(sd_version),
            "author_vector": self._encode_author(author),
            "quality_score": self._quality_score(stats),
            "popularity_score": self._popularity_score(stats),
            "community_engagement": self._engagement_score(stats),
            "file_size_normalized": self._normalize_file_size(
                getattr(lora, "primary_file_size_kb", None),
            ),
            "recency_score": self._recency_score(getattr(lora, "published_at", None)),
            "maturity_score": self._maturity_score(getattr(lora, "created_at", None)),
            "nsfw_level_normalized": (
                getattr(lora, "nsfw_level", 0) / 10.0
                if getattr(lora, "nsfw_level", None)
                else 0.0
            ),
            "supports_generation": float(
                bool(getattr(lora, "supports_generation", False))
            ),
            "sd_compatibility_score": self._sd_compatibility(sd_version),
            "user_activation_frequency": 0.0,
            "user_success_rate": 0.5,
            "recent_usage_trend": 0.0,
        }

    def _encode_tags(self, tags: Optional[Sequence[str]]) -> list[float]:
        if not tags:
            return [0.0] * len(self._COMMON_TAG_CATEGORIES)

        vector: list[float] = []
        for category in self._COMMON_TAG_CATEGORIES:
            score = sum(1 for tag in tags if category in tag.lower())
            vector.append(min(score / len(tags), 1.0))

        return vector

    def _encode_sd_version(self, sd_version: Optional[str]) -> list[float]:
        if not sd_version:
            return [0.0, 0.0, 0.0]

        version_lower = sd_version.lower()
        if "xl" in version_lower or "sdxl" in version_lower:
            return [0.0, 0.0, 1.0]
        if "2." in version_lower or "sd2" in version_lower:
            return [0.0, 1.0, 0.0]
        return [1.0, 0.0, 0.0]

    def _encode_author(self, author: Optional[str]) -> float:
        if not author:
            return 0.0
        return min(len(author) / 20.0, 1.0)

    def _quality_score(self, stats: Optional[Dict[str, Any]]) -> float:
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

    def _popularity_score(self, stats: Optional[Dict[str, Any]]) -> float:
        if not stats:
            return 0.0
        downloads = stats.get("downloadCount", 0)
        return min(np.log10(downloads + 1) / 6.0, 1.0)

    def _engagement_score(self, stats: Optional[Dict[str, Any]]) -> float:
        if not stats:
            return 0.0
        comments = stats.get("commentCount", 0)
        favorites = stats.get("favoriteCount", 0)
        engagement = comments * 0.6 + favorites * 0.4
        return min(np.log10(engagement + 1) / 3.0, 1.0)

    def _normalize_file_size(self, size_kb: Optional[int]) -> float:
        if not size_kb:
            return 0.5
        try:
            return float(min(size_kb / (500 * 1024), 1.0))
        except Exception:  # pragma: no cover - defensive branch
            self._logger.debug("Failed to normalize file size", exc_info=True)
            return 0.5

    def _recency_score(self, published_at: Any) -> float:
        if not published_at:
            return 0.0
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            if getattr(published_at, "tzinfo", None) is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            days_old = (now - published_at).days
            return max(0.0, 1.0 - (days_old / 365.0))
        except Exception:  # pragma: no cover - defensive branch
            self._logger.debug("Failed to compute recency score", exc_info=True)
            return 0.5

    def _maturity_score(self, created_at: Any) -> float:
        if not created_at:
            return 0.0
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            if getattr(created_at, "tzinfo", None) is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            days_old = (now - created_at).days
            return min(days_old / 180.0, 1.0)
        except Exception:  # pragma: no cover - defensive branch
            self._logger.debug("Failed to compute maturity score", exc_info=True)
            return 0.5

    def _sd_compatibility(self, sd_version: Optional[str]) -> float:
        if not sd_version:
            return 0.5

        version_lower = sd_version.lower()
        if "xl" in version_lower or "sdxl" in version_lower:
            return 1.0
        if "2." in version_lower:
            return 0.7
        return 0.8


__all__ = ["ScoreCalculator", "ScoreCalculatorProtocol"]
