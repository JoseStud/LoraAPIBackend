"""Trigger phrase normalisation and trigger-based retrieval."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from threading import RLock
from typing import (
    Dict,
    Iterable,
    List,
    Mapping,
    MutableMapping,
    Optional,
    Sequence,
    Tuple,
)

import numpy as np
from structlog.stdlib import BoundLogger

from backend.core.logging import get_logger

from .encoders import TriggerEmbedder

DEFAULT_TRIGGER_ALIASES: Mapping[str, str] = {
    "1girl": "girl",
    "one girl": "girl",
    "solo": "solo",
    "1boy": "boy",
    "one boy": "boy",
    "sai": "stable diffusion automatic1111",
    "sdxl": "stable diffusion xl",
    "seraphim": "seraph",
    "angelic": "angel",
}


@dataclass(frozen=True)
class TriggerCandidate:
    """Representation of a trigger phrase and its originating source."""

    phrase: str
    source: str


@dataclass(frozen=True)
class TriggerResolution:
    """Result of trigger normalisation and alias expansion."""

    canonical: List[str]
    alias_map: Dict[str, str]
    confidence: Dict[str, float]
    sources: Dict[str, List[str]]
    normalized_query: Optional[str] = None


class TriggerResolver:
    """Normalise trigger phrases and apply alias mappings consistently."""

    def __init__(
        self,
        *,
        alias_overrides: Optional[Mapping[str, str]] = None,
        minimum_length: int = 2,
    ) -> None:
        """Prepare the resolver with optional alias overrides and minimum length."""
        self._minimum_length = minimum_length
        self._alias_map: Dict[str, str] = {}
        self._alias_map.update(DEFAULT_TRIGGER_ALIASES)
        if alias_overrides:
            for raw, target in alias_overrides.items():
                self._alias_map[self._normalise(raw)] = self._normalise(target)

    @staticmethod
    def _normalise(text: str) -> str:
        normalized = unicodedata.normalize("NFKC", text or "")
        normalized = normalized.lower()
        normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    def _filter_phrase(self, phrase: str) -> Optional[str]:
        cleaned = self._normalise(phrase)
        if not cleaned:
            return None
        if len(cleaned) < self._minimum_length:
            return None
        return cleaned

    def resolve(self, candidates: Sequence[TriggerCandidate]) -> TriggerResolution:
        """Return canonical triggers derived from ``candidates``."""
        alias_map: Dict[str, str] = {}
        confidence: Dict[str, float] = {}
        source_map: MutableMapping[str, List[str]] = defaultdict(list)
        canonical_counter: Counter[str] = Counter()

        for candidate in candidates:
            filtered = self._filter_phrase(candidate.phrase)
            if filtered is None:
                continue
            canonical = self._alias_map.get(filtered, filtered)
            alias_map[filtered] = canonical
            canonical_counter[canonical] += 1
            confidence.setdefault(canonical, 0.0)
            confidence[canonical] = min(1.0, confidence[canonical] + 0.2)
            source_map[canonical].append(candidate.source)

        ordered_canonical = [trigger for trigger, _ in canonical_counter.most_common()]

        return TriggerResolution(
            canonical=ordered_canonical,
            alias_map=alias_map,
            confidence={
                key: round(value or 0.2, 2) for key, value in confidence.items()
            },
            sources=dict(source_map),
        )

    def resolve_query(self, query: str) -> TriggerResolution:
        """Resolve a user provided query string."""
        normalized = self._filter_phrase(query)
        if not normalized:
            return TriggerResolution(
                canonical=[],
                alias_map={},
                confidence={},
                sources={},
                normalized_query=None,
            )

        words = [normalized]
        if " " in normalized:
            words.extend(
                word
                for word in normalized.split(" ")
                if len(word) >= self._minimum_length
            )

        candidates = [TriggerCandidate(phrase=word, source="query") for word in words]
        resolution = self.resolve(candidates)
        return TriggerResolution(
            canonical=resolution.canonical,
            alias_map=resolution.alias_map,
            confidence=resolution.confidence,
            sources=resolution.sources,
            normalized_query=normalized,
        )

    def expand_activation_text(self, text: Optional[str]) -> List[TriggerCandidate]:
        """Split activation text into candidate trigger phrases."""
        if not text:
            return []
        pieces = re.split(r"[\n,;/]+", text)
        return [
            TriggerCandidate(phrase=piece.strip(), source="activation_text")
            for piece in pieces
            if piece.strip()
        ]

    def build_candidates_from_adapter(
        self,
        triggers: Iterable[str],
        trained_words: Iterable[str],
        activation_text: Optional[str],
    ) -> List[TriggerCandidate]:
        """Collect trigger candidates from adapter metadata."""
        candidates: List[TriggerCandidate] = []
        for phrase in triggers:
            candidates.append(TriggerCandidate(phrase=phrase, source="trigger"))
        for phrase in trained_words:
            candidates.append(TriggerCandidate(phrase=phrase, source="trained_word"))
        candidates.extend(self.expand_activation_text(activation_text))
        return candidates


@dataclass(frozen=True)
class TriggerCandidateResult:
    """Container for intermediate trigger recommendation candidates."""

    adapter_id: str
    canonical_trigger: Optional[str]
    final_score: float
    similarity_score: float
    explanation: str
    signals: Dict[str, float]


class TriggerRecommendationEngine:
    """Search adapters by trigger through an inverted index and trigger vectors."""

    def __init__(
        self,
        *,
        resolver: TriggerResolver,
        embedder: TriggerEmbedder,
        logger: Optional[BoundLogger] = None,
        max_semantic_candidates: int = 100,
    ) -> None:
        """Store the resolver and embedder used to build and query the index."""
        self._resolver = resolver
        self._embedder = embedder
        self._logger = logger or get_logger(__name__)
        self._max_semantic_candidates = max_semantic_candidates
        self._trigger_to_loras: Dict[str, set[str]] = {}
        self._vector_keys: List[Tuple[str, str]] = []
        self._vectors: Optional[np.ndarray] = None
        self._adapter_metadata: Dict[str, Dict[str, object]] = {}
        self._adapter_count: int = 0
        self._lock = RLock()

    @property
    def metadata(self) -> Dict[str, Dict[str, object]]:
        """Expose cached adapter metadata for explanation generation."""
        return self._adapter_metadata

    def search(
        self, repository, query: str, limit: int
    ) -> List[TriggerCandidateResult]:
        """Return ranked trigger candidates for ``query``, refreshing the index."""
        # Requests search from threadpool threads: read one consistent index
        # even if another request rebuilds it meanwhile.
        with self._lock:
            self._ensure_index(repository)
            trigger_to_loras = self._trigger_to_loras
            vector_keys = self._vector_keys
            vectors = self._vectors
        if not query:
            return []

        resolution = self._resolver.resolve_query(query)
        scored: Dict[str, TriggerCandidateResult] = {}

        for canonical in resolution.canonical:
            matches = trigger_to_loras.get(canonical, set())
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
            query_vector = self._embedder.encode_single(resolution.normalized_query)
            if vectors is not None and len(vectors):
                similarities = np.dot(vectors, query_vector)
                top_indices = np.argsort(similarities)[::-1][
                    : self._max_semantic_candidates
                ]
                for idx in top_indices:
                    adapter_id, trigger = vector_keys[idx]
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

    def _ensure_index(self, repository) -> None:
        """Rebuild the index when the number of active adapters changes."""
        with self._lock:
            current_count = repository.count_active_adapters()
            if self._vectors is not None and current_count == self._adapter_count:
                return
            self._logger.info("Rebuilding trigger index for %s adapters", current_count)
            self._rebuild(repository)
            self._adapter_count = current_count

    def _rebuild(self, repository) -> None:
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
                candidates = self._resolver.build_candidates_from_adapter(
                    adapter.triggers or [],
                    adapter.trained_words or [],
                    adapter.activation_text,
                )
                resolution = self._resolver.resolve(candidates)
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
                computed = self._embedder.encode(triggers)
                trigger_vectors = [vector for vector in computed]

            for trigger, vector in zip(triggers, trigger_vectors, strict=False):
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
            matrix = np.zeros((0, self._embedder.dimension), dtype=np.float32)

        self._trigger_to_loras = trigger_to_loras
        self._vector_keys = vector_keys
        self._vectors = matrix
        self._adapter_metadata = adapter_metadata
