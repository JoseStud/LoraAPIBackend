"""Recommendation engine used for similarity scoring."""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from .interfaces import RecommendationEngineProtocol


class LoRARecommendationEngine(RecommendationEngineProtocol):
    """High-performance similarity matching using optimized algorithms."""

    def __init__(
        self,
        feature_extractor: Any,
        *,
        device: str = "cuda",
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Initialize recommendation engine."""

        self.feature_extractor = feature_extractor
        self.device = device
        self._logger = logger or logging.getLogger(__name__)

        self.semantic_embeddings: Optional[np.ndarray] = None
        self.artistic_embeddings: Optional[np.ndarray] = None
        self.technical_embeddings: Optional[np.ndarray] = None
        self.lora_ids: List[str] = []
        self.loras_dict: Dict[str, Any] = {}

        self._faiss_available = False
        try:
            import faiss  # type: ignore

            self._faiss = faiss
            self._faiss_available = True
            self._logger.info("FAISS available for fast similarity search")
        except ImportError:
            self._faiss = None
            self._logger.debug(
                "FAISS not available, falling back to numpy similarity computation",
            )

    def build_similarity_index(self, loras: Sequence[Any]) -> None:
        """Build similarity index for fast recommendations."""
        self._logger.info("Building similarity index for %s LoRAs", len(loras))

        embeddings = self.feature_extractor.semantic_embedder.batch_encode_collection(
            loras,
        )

        self.semantic_embeddings = embeddings["semantic"].astype("float32")
        self.artistic_embeddings = embeddings["artistic"].astype("float32")
        self.technical_embeddings = embeddings["technical"].astype("float32")

        self.semantic_embeddings = self._normalize_embeddings(self.semantic_embeddings)
        self.artistic_embeddings = self._normalize_embeddings(self.artistic_embeddings)
        self.technical_embeddings = self._normalize_embeddings(self.technical_embeddings)

        self.lora_ids = [lora.id for lora in loras]
        self.loras_dict = {lora.id: lora for lora in loras}

        self._logger.info(
            "Similarity index built successfully for %s LoRAs",
            len(loras),
        )

    def _normalize_embeddings(self, embeddings: np.ndarray) -> np.ndarray:
        if embeddings.size == 0:
            return embeddings

        if embeddings.ndim == 1:
            if embeddings.size == 0:
                return embeddings
            embeddings = embeddings.reshape(1, -1)
        elif embeddings.ndim == 2 and embeddings.shape[0] == 0:
            return embeddings

        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return embeddings / norms

    def get_recommendations(
        self,
        target_lora: Any,
        n_recommendations: int = 20,
        weights: Optional[Dict[str, float]] = None,
        diversify_results: bool = True,
    ) -> List[Dict[str, Any]]:
        """Generate recommendations using multi-modal similarity."""
        if self.semantic_embeddings is None or self.artistic_embeddings is None:
            return []

        if weights is None:
            weights = {
                "semantic": 0.6,
                "artistic": 0.3,
                "technical": 0.1,
            }

        target_embeddings = self.feature_extractor.semantic_embedder.create_multi_modal_embedding(
            target_lora,
        )

        semantic_query = self._normalize_embeddings(
            target_embeddings["semantic"].reshape(1, -1),
        )[0]
        artistic_query = self._normalize_embeddings(
            target_embeddings["artistic"].reshape(1, -1),
        )[0]
        technical_query = self._normalize_embeddings(
            target_embeddings["technical"].reshape(1, -1),
        )[0]

        semantic_similarities = np.dot(self.semantic_embeddings, semantic_query)
        artistic_similarities = np.dot(self.artistic_embeddings, artistic_query)
        technical_similarities = np.dot(self.technical_embeddings, technical_query)

        combined_similarities = (
            weights["semantic"] * semantic_similarities
            + weights["artistic"] * artistic_similarities
            + weights["technical"] * technical_similarities
        )

        candidate_indices: List[int] = []
        for idx in np.argsort(combined_similarities)[::-1]:
            if self.lora_ids[idx] != target_lora.id:
                candidate_indices.append(idx)
                if len(candidate_indices) >= n_recommendations * 2:
                    break

        final_recommendations: List[Dict[str, Any]] = []

        for idx in candidate_indices:
            candidate_lora = self.loras_dict[self.lora_ids[idx]]

            if self._is_compatible(target_lora, candidate_lora):
                explanation = self._generate_explanation(target_lora, candidate_lora)

                quality_boost = (
                    self._calculate_quality_boost(candidate_lora)
                    if diversify_results
                    else 0.0
                )
                popularity_boost = (
                    self._calculate_popularity_boost(candidate_lora)
                    if diversify_results
                    else 0.0
                )
                recency_boost = (
                    self._calculate_recency_boost(candidate_lora)
                    if diversify_results
                    else 0.0
                )

                combined_score = combined_similarities[idx]
                if diversify_results:
                    final_score = combined_score * (
                        1 + quality_boost + popularity_boost + recency_boost
                    )
                else:
                    final_score = combined_score

                final_recommendations.append(
                    {
                        "lora_id": self.lora_ids[idx],
                        "similarity_score": float(combined_score),
                        "final_score": float(final_score),
                        "explanation": explanation,
                        "semantic_similarity": float(semantic_similarities[idx]),
                        "artistic_similarity": float(artistic_similarities[idx]),
                        "technical_similarity": float(technical_similarities[idx]),
                        "quality_boost": float(quality_boost),
                        "popularity_boost": float(popularity_boost),
                        "recency_boost": float(recency_boost),
                    },
                )

                if len(final_recommendations) >= n_recommendations:
                    break

        final_recommendations.sort(key=lambda x: x["final_score"], reverse=True)
        return final_recommendations[:n_recommendations]

    def _is_compatible(self, target_lora: Any, candidate_lora: Any) -> bool:
        if getattr(target_lora, "sd_version", None) and getattr(
            candidate_lora, "sd_version", None,
        ):
            return target_lora.sd_version == candidate_lora.sd_version
        return True

    def _generate_explanation(self, target_lora: Any, candidate_lora: Any) -> str:
        explanations: List[str] = []

        if getattr(target_lora, "description", None) and getattr(
            candidate_lora, "description", None,
        ):
            common_keywords = self._find_common_keywords(
                target_lora.description,
                candidate_lora.description,
            )
            if common_keywords:
                explanations.append(
                    f"Similar content: {', '.join(common_keywords[:3])}",
                )

        if getattr(target_lora, "tags", None) and getattr(
            candidate_lora, "tags", None,
        ):
            common_tags = set(target_lora.tags) & set(candidate_lora.tags)
            if common_tags:
                explanations.append(
                    f"Shared tags: {', '.join(list(common_tags)[:3])}",
                )

        if getattr(target_lora, "sd_version", None) == getattr(
            candidate_lora, "sd_version", None,
        ) and getattr(target_lora, "sd_version", None):
            explanations.append(f"Same SD version ({target_lora.sd_version})")

        return " | ".join(explanations) if explanations else "General similarity"

    def _find_common_keywords(self, text1: str, text2: str) -> List[str]:
        if not text1 or not text2:
            return []

        words1 = set(re.findall(r"\b\w+\b", text1.lower()))
        words2 = set(re.findall(r"\b\w+\b", text2.lower()))

        stop_words = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
        }
        common_words = (words1 & words2) - stop_words

        return [word for word in common_words if len(word) > 3][:5]

    def _calculate_quality_boost(self, lora: Any) -> float:
        stats = getattr(lora, "stats", None)
        if not stats:
            return 0.0

        rating = stats.get("rating", 0)
        if rating > 4:
            return 0.1
        if rating > 3:
            return 0.05
        return 0.0

    def _calculate_popularity_boost(self, lora: Any) -> float:
        stats = getattr(lora, "stats", None)
        if not stats:
            return 0.0

        downloads = stats.get("downloadCount", 0)
        if downloads > 10000:
            return 0.1
        if downloads > 1000:
            return 0.05
        return 0.0

    def _calculate_recency_boost(self, lora: Any) -> float:
        published_at = getattr(lora, "published_at", None)
        if not published_at:
            return 0.0
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            if getattr(published_at, "tzinfo", None) is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            days_old = (now - published_at).days
            if days_old < 30:
                return 0.05
            return 0.0
        except Exception:
            return 0.0

    def update_index_incremental(self, new_loras: Sequence[Any]) -> None:
        if not new_loras:
            return

        self._logger.info("Adding %s new LoRAs to index", len(new_loras))

        new_embeddings = self.feature_extractor.semantic_embedder.batch_encode_collection(
            new_loras,
        )

        new_semantic = self._normalize_embeddings(
            new_embeddings["semantic"].astype("float32"),
        )
        new_artistic = self._normalize_embeddings(
            new_embeddings["artistic"].astype("float32"),
        )
        new_technical = self._normalize_embeddings(
            new_embeddings["technical"].astype("float32"),
        )

        if self.semantic_embeddings is not None:
            self.semantic_embeddings = np.vstack([
                self.semantic_embeddings,
                new_semantic,
            ])
            self.artistic_embeddings = np.vstack([
                self.artistic_embeddings,
                new_artistic,
            ])
            self.technical_embeddings = np.vstack([
                self.technical_embeddings,
                new_technical,
            ])
        else:
            self.semantic_embeddings = new_semantic
            self.artistic_embeddings = new_artistic
            self.technical_embeddings = new_technical

        for lora in new_loras:
            self.lora_ids.append(lora.id)
            self.loras_dict[lora.id] = lora

        self._logger.info("Added %s new LoRAs to index", len(new_loras))
