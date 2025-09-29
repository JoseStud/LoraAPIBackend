"""Trigger-specific retrieval utilities for the recommendation service."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from threading import RLock
from typing import Dict, List, Optional, Tuple

import numpy as np

from .components.trigger_embedder import TriggerEmbedder
from .components.trigger_processing import TriggerResolver


@dataclass(frozen=True)
class TriggerCandidateResult:
    """Container for intermediate trigger recommendation candidates."""

    adapter_id: str
    canonical_trigger: Optional[str]
    final_score: float
    similarity_score: float
    explanation: str
    signals: Dict[str, float]


class TriggerSearchIndex:
    """Maintain an inverted index and embedding cache for triggers."""

    def __init__(
        self,
        *,
        logger: Optional[logging.Logger] = None,
        max_semantic_candidates: int = 100,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)
        self._max_semantic_candidates = max_semantic_candidates
        self._trigger_to_loras: Dict[str, set[str]] = {}
        self._vector_keys: List[Tuple[str, str]] = []
        self._vectors: Optional[np.ndarray] = None
        self._adapter_metadata: Dict[str, Dict[str, object]] = {}
        self._adapter_count: int = 0
        self._lock = RLock()

    @property
    def adapter_metadata(self) -> Dict[str, Dict[str, object]]:
        """Expose the cached adapter metadata."""
        return self._adapter_metadata

    def ensure(
        self, repository, embedder: TriggerEmbedder, resolver: TriggerResolver
    ) -> None:
        """Ensure the index is populated and in sync with active adapters."""
        with self._lock:
            current_count = repository.count_active_adapters()
            if self._vectors is not None and current_count == self._adapter_count:
                return
            self._logger.info("Rebuilding trigger index for %s adapters", current_count)
            self._rebuild(repository, embedder, resolver)
            self._adapter_count = current_count

    def _rebuild(
        self, repository, embedder: TriggerEmbedder, resolver: TriggerResolver
    ) -> None:
        trigger_to_loras: Dict[str, set[str]] = {}
        vector_keys: List[Tuple[str, str]] = []
        vector_payload: List[np.ndarray] = []
        adapter_metadata: Dict[str, Dict[str, object]] = {}

        records = repository.get_active_loras_with_embeddings()
        for adapter, embedding in records:
            triggers = list(getattr(embedding, "normalized_triggers", []) or [])
            aliases = dict(getattr(embedding, "trigger_aliases", {}) or {})
            metadata = dict(getattr(embedding, "trigger_metadata", {}) or {})
            stored_vectors = list(getattr(embedding, "trigger_embeddings", []) or [])

            if not triggers and (adapter.triggers or adapter.activation_text):
                candidates = resolver.build_candidates_from_adapter(
                    adapter.triggers or [],
                    adapter.trained_words or [],
                    adapter.activation_text,
                )
                resolution = resolver.resolve(candidates)
                triggers = resolution.canonical
                aliases = resolution.alias_map
                metadata = {
                    "confidence": resolution.confidence,
                    "sources": resolution.sources,
                }

            if not triggers:
                continue

            trigger_vectors: List[np.ndarray] = []
            if stored_vectors and len(stored_vectors) == len(triggers):
                for vector in stored_vectors:
                    trigger_vectors.append(np.asarray(vector, dtype=np.float32))
            else:
                computed = embedder.encode(triggers)
                trigger_vectors = [vector for vector in computed]

            for trigger, vector in zip(triggers, trigger_vectors):
                vector = vector.astype(np.float32)
                norm = np.linalg.norm(vector)
                if norm:
                    vector = vector / norm
                trigger_to_loras.setdefault(trigger, set()).add(adapter.id)
                vector_keys.append((adapter.id, trigger))
                vector_payload.append(vector)

            adapter_metadata[adapter.id] = {
                "id": adapter.id,
                "name": adapter.name,
                "description": adapter.description,
                "author_username": adapter.author_username,
                "tags": list(adapter.tags or [])[:5],
                "sd_version": adapter.sd_version,
                "nsfw_level": adapter.nsfw_level,
                "stats": adapter.stats or {},
                "predicted_style": getattr(embedding, "predicted_style", None),
                "trigger_aliases": aliases,
                "trigger_sources": metadata.get("sources", {}),
                "trigger_confidence": metadata.get("confidence", {}),
                "normalized_triggers": triggers,
            }

        if vector_payload:
            matrix = np.vstack(vector_payload)
        else:
            matrix = np.zeros((0, embedder.dimension), dtype=np.float32)

        self._trigger_to_loras = trigger_to_loras
        self._vector_keys = vector_keys
        self._vectors = matrix
        self._adapter_metadata = adapter_metadata

    def search(
        self,
        *,
        query: str,
        resolver: TriggerResolver,
        embedder: TriggerEmbedder,
        limit: int,
    ) -> List[TriggerCandidateResult]:
        """Return ranked trigger candidates for ``query``."""
        if not query:
            return []

        resolution = resolver.resolve_query(query)
        scored: Dict[str, TriggerCandidateResult] = {}

        for canonical in resolution.canonical:
            matches = self._trigger_to_loras.get(canonical, set())
            for adapter_id in matches:
                confidence = resolution.confidence.get(canonical, 1.0)
                explanation = f"Exact trigger match: '{canonical}'"
                result = TriggerCandidateResult(
                    adapter_id=adapter_id,
                    canonical_trigger=canonical,
                    final_score=1.0 * confidence,
                    similarity_score=1.0,
                    explanation=explanation,
                    signals={"exact": confidence},
                )
                existing = scored.get(adapter_id)
                if existing is None or result.final_score > existing.final_score:
                    scored[adapter_id] = result

        need_semantic = len(scored) < limit
        if need_semantic and resolution.normalized_query:
            query_vector = embedder.encode_single(resolution.normalized_query)
            if self._vectors is not None and len(self._vectors):
                similarities = np.dot(self._vectors, query_vector)
                top_indices = np.argsort(similarities)[::-1][
                    : self._max_semantic_candidates
                ]
                for idx in top_indices:
                    adapter_id, trigger = self._vector_keys[idx]
                    if adapter_id in scored and scored[adapter_id].signals.get("exact"):
                        continue
                    similarity = float(similarities[idx])
                    if similarity <= 0:
                        continue
                    explanation = f"Semantic trigger similarity: {similarity:.2f}"
                    result = TriggerCandidateResult(
                        adapter_id=adapter_id,
                        canonical_trigger=trigger,
                        final_score=similarity,
                        similarity_score=similarity,
                        explanation=explanation,
                        signals={"semantic": similarity},
                    )
                    existing = scored.get(adapter_id)
                    if existing is None or result.final_score > existing.final_score:
                        scored[adapter_id] = result

        ranked = sorted(
            scored.values(), key=lambda item: item.final_score, reverse=True
        )
        return ranked[:limit]


class TriggerRecommendationEngine:
    """High level trigger recommendation helper with cached index."""

    def __init__(
        self,
        *,
        resolver: TriggerResolver,
        embedder: TriggerEmbedder,
        index: TriggerSearchIndex,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._resolver = resolver
        self._embedder = embedder
        self._index = index
        self._logger = logger or logging.getLogger(__name__)

    def search(
        self, repository, query: str, limit: int
    ) -> List[TriggerCandidateResult]:
        """Return trigger candidates ensuring caches are populated."""
        self._index.ensure(repository, self._embedder, self._resolver)
        return self._index.search(
            query=query,
            resolver=self._resolver,
            embedder=self._embedder,
            limit=limit,
        )

    @property
    def metadata(self) -> Dict[str, Dict[str, object]]:
        """Expose cached adapter metadata for explanation generation."""
        return self._index.adapter_metadata


__all__ = [
    "TriggerCandidateResult",
    "TriggerRecommendationEngine",
    "TriggerSearchIndex",
]
