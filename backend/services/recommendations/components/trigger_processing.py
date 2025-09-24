"""Utilities for normalising and resolving trigger phrases."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence

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

        ordered_canonical = [
            trigger
            for trigger, _ in canonical_counter.most_common()
        ]

        return TriggerResolution(
            canonical=ordered_canonical,
            alias_map=alias_map,
            confidence={key: round(value or 0.2, 2) for key, value in confidence.items()},
            sources=dict(source_map),
        )

    def resolve_query(self, query: str) -> TriggerResolution:
        """Resolve a user provided query string."""
        normalized = self._filter_phrase(query)
        if not normalized:
            return TriggerResolution(
                canonical=[], alias_map={}, confidence={}, sources={}, normalized_query=None
            )

        words = [normalized]
        if " " in normalized:
            words.extend(word for word in normalized.split(" ") if len(word) >= self._minimum_length)

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
        return [TriggerCandidate(phrase=piece.strip(), source="activation_text") for piece in pieces if piece.strip()]

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


__all__ = [
    "TriggerCandidate",
    "TriggerResolution",
    "TriggerResolver",
]
