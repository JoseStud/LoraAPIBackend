"""Database access helpers for LoRA embedding persistence."""

from __future__ import annotations

import pickle
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence, Set

from sqlmodel import Session, select

from backend.models import Adapter, LoRAEmbedding


class LoRAEmbeddingRepository:
    """Encapsulate database access for LoRA embedding records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Lookup helpers
    # ------------------------------------------------------------------
    def get_adapter(self, adapter_id: str) -> Adapter | None:
        """Return the adapter identified by ``adapter_id`` if it exists."""
        return self._session.get(Adapter, adapter_id)

    def get_embedding(self, adapter_id: str) -> LoRAEmbedding | None:
        """Return the persisted embedding entry for ``adapter_id``."""
        return self._session.get(LoRAEmbedding, adapter_id)

    def embedding_exists(self, adapter_id: str) -> bool:
        """Return ``True`` when an embedding record already exists."""
        return self.get_embedding(adapter_id) is not None

    def list_adapters(self, adapter_ids: Sequence[str] | None = None) -> list[Adapter]:
        """Return adapters by id or all active adapters when ``adapter_ids`` is ``None``."""
        if adapter_ids:
            stmt = select(Adapter).where(Adapter.id.in_(adapter_ids))
        else:
            stmt = select(Adapter).where(Adapter.active)

        return list(self._session.exec(stmt))

    def list_existing_embedding_ids(self, adapter_ids: Sequence[str]) -> Set[str]:
        """Return the subset of ``adapter_ids`` that already have embeddings."""
        if not adapter_ids:
            return set()

        stmt = select(LoRAEmbedding.adapter_id).where(
            LoRAEmbedding.adapter_id.in_(adapter_ids),
        )
        return set(self._session.exec(stmt).all())

    def list_active_adapters_with_embeddings(self) -> list[Adapter]:
        """Return active adapters that have stored embeddings."""
        stmt = (
            select(Adapter)
            .join(LoRAEmbedding, Adapter.id == LoRAEmbedding.adapter_id)
            .where(Adapter.active)
        )
        return list(self._session.exec(stmt))

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def save_features(self, adapter_id: str, features: Mapping[str, Any]) -> None:
        """Persist the computed ``features`` for ``adapter_id``."""
        try:
            self._upsert_features(adapter_id, features)
            self._session.commit()
        except Exception:  # pragma: no cover - defensive rollback
            self._session.rollback()
            raise

    # Internal utilities -------------------------------------------------
    def _upsert_features(self, adapter_id: str, features: Mapping[str, Any]) -> None:
        now = datetime.now(timezone.utc)
        payload = self._serialize_features(features)

        existing = self._session.get(LoRAEmbedding, adapter_id)

        if existing:
            for field, value in payload.items():
                setattr(existing, field, value)
            existing.last_computed = now
            existing.updated_at = now
            self._session.add(existing)
            return

        record = LoRAEmbedding(
            adapter_id=adapter_id,
            **payload,
            last_computed=now,
        )
        self._session.add(record)

    @staticmethod
    def _serialize_features(features: Mapping[str, Any]) -> dict[str, Any]:
        def serialize_embedding(value: Any) -> bytes | None:
            if value is None:
                return None
            return pickle.dumps(value)

        return {
            'semantic_embedding': serialize_embedding(features.get('semantic_embedding')),
            'artistic_embedding': serialize_embedding(features.get('artistic_embedding')),
            'technical_embedding': serialize_embedding(features.get('technical_embedding')),
            'extracted_keywords': list(features.get('extracted_keywords', [])),
            'keyword_scores': list(features.get('keyword_scores', [])),
            'predicted_style': features.get('predicted_style'),
            'style_confidence': features.get('style_confidence'),
            'sentiment_label': features.get('sentiment_label'),
            'sentiment_score': features.get('sentiment_score'),
            'quality_score': features.get('quality_score'),
            'popularity_score': features.get('popularity_score'),
            'recency_score': features.get('recency_score'),
            'compatibility_score': features.get('sd_compatibility_score'),
        }

