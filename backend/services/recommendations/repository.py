"""Database access for recommendations: embeddings, feedback and preferences."""

from __future__ import annotations

import pickle
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import (
    Adapter,
    LoRAEmbedding,
    RecommendationFeedback,
    RecommendationSession,
    UserPreference,
)
from backend.schemas.recommendations import (
    UserFeedbackRequest,
    UserPreferenceRequest,
)


class RecommendationRepository:
    """Encapsulate persistence concerns for recommendations."""

    def __init__(self, session: Session):
        """Store the database session used for recommendation persistence."""
        self._session = session

    # ------------------------------------------------------------------
    # Feedback and preferences
    # ------------------------------------------------------------------
    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""
        recommendation_session = self._session.get(
            RecommendationSession, feedback.session_id
        )
        if recommendation_session is None:
            raise ValueError(
                f"Recommendation session {feedback.session_id} not found",
            )

        adapter = self._session.get(Adapter, feedback.recommended_lora_id)
        if adapter is None:
            raise ValueError(
                f"Adapter {feedback.recommended_lora_id} not found",
            )

        feedback_record = RecommendationFeedback(
            session_id=feedback.session_id,
            recommended_lora_id=feedback.recommended_lora_id,
            feedback_type=feedback.feedback_type,
            feedback_reason=feedback.feedback_reason,
            implicit_signal=feedback.implicit_signal,
        )

        self._session.add(feedback_record)

        feedback_map: Dict[str, Dict[str, str | float | None]] = (
            recommendation_session.user_feedback or {}
        )
        feedback_map[feedback.recommended_lora_id] = {
            "feedback_type": feedback.feedback_type,
            "implicit_signal": feedback.implicit_signal,
            "feedback_reason": feedback.feedback_reason,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        recommendation_session.user_feedback = feedback_map
        self._session.add(recommendation_session)

        self._session.commit()
        self._session.refresh(feedback_record)

        return feedback_record

    def update_user_preference(
        self,
        preference: UserPreferenceRequest,
    ) -> UserPreference:
        """Create or update a persisted user preference record."""
        stmt = select(UserPreference).where(
            UserPreference.preference_type == preference.preference_type,
            UserPreference.preference_value == preference.preference_value,
        )

        existing = self._session.exec(stmt).first()
        now = datetime.now(timezone.utc)
        learned_from = "explicit" if preference.explicit else "feedback"

        if existing:
            existing.confidence = preference.confidence
            existing.learned_from = learned_from
            existing.evidence_count += 1
            existing.last_evidence_at = now
            existing.updated_at = now
            self._session.add(existing)
            self._session.commit()
            self._session.refresh(existing)
            return existing

        new_preference = UserPreference(
            preference_type=preference.preference_type,
            preference_value=preference.preference_value,
            confidence=preference.confidence,
            learned_from=learned_from,
            evidence_count=1,
            last_evidence_at=now,
        )
        self._session.add(new_preference)
        self._session.commit()
        self._session.refresh(new_preference)
        return new_preference

    # ------------------------------------------------------------------
    # Adapters and embeddings
    # ------------------------------------------------------------------
    def get_adapter(self, adapter_id: str) -> Optional[Adapter]:
        """Return an adapter by identifier."""
        return self._session.get(Adapter, adapter_id)

    def get_embedding(self, adapter_id: str) -> Optional[LoRAEmbedding]:
        """Return the embedding entry for ``adapter_id`` if present."""
        return self._session.get(LoRAEmbedding, adapter_id)

    def list_adapters(self, adapter_ids: Sequence[str] | None = None) -> List[Adapter]:
        """Return adapters by id, or all active adapters when none are given."""
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

    def get_active_loras_with_embeddings(
        self,
        *,
        exclude_ids: Optional[Sequence[str]] = None,
    ) -> List[Tuple[Adapter, LoRAEmbedding]]:
        """Return active adapters that have stored embeddings."""
        stmt = (
            select(Adapter, LoRAEmbedding)
            .join(LoRAEmbedding, Adapter.id == LoRAEmbedding.adapter_id)
            .where(Adapter.active)
        )

        if exclude_ids:
            stmt = stmt.where(~Adapter.id.in_(exclude_ids))

        return list(self._session.exec(stmt).all())

    def list_active_adapters_with_embeddings(self) -> List[Adapter]:
        """Return active adapters that have stored embeddings, without the blobs."""
        stmt = (
            select(Adapter)
            .join(LoRAEmbedding, Adapter.id == LoRAEmbedding.adapter_id)
            .where(Adapter.active)
        )
        return list(self._session.exec(stmt))

    def get_recent_active_adapters(self, limit: int) -> List[Adapter]:
        """Return a deterministic list of recently active adapters."""
        stmt = (
            select(Adapter)
            .where(Adapter.active)
            .order_by(
                Adapter.published_at.desc().nullslast(),
                Adapter.created_at.desc(),
            )
            .limit(limit)
        )
        return list(self._session.exec(stmt))

    def save_features(self, adapter_id: str, features: Mapping[str, Any]) -> None:
        """Insert or update the embedding record for ``adapter_id``."""
        now = datetime.now(timezone.utc)
        payload = _serialize_features(features)
        try:
            existing = self._session.get(LoRAEmbedding, adapter_id)
            if existing:
                for field, value in payload.items():
                    setattr(existing, field, value)
                existing.last_computed = now
                existing.updated_at = now
                self._session.add(existing)
            else:
                self._session.add(
                    LoRAEmbedding(adapter_id=adapter_id, **payload, last_computed=now)
                )
            self._session.commit()
        except Exception:  # pragma: no cover - defensive rollback
            self._session.rollback()
            raise

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------
    def count_active_adapters(self) -> int:
        """Return the number of active adapters."""
        return self._count(select(func.count(Adapter.id)).where(Adapter.active))

    def count_lora_embeddings(self) -> int:
        """Return the number of stored LoRA embeddings."""
        return self._count(select(func.count(LoRAEmbedding.adapter_id)))

    def count_user_preferences(self) -> int:
        """Return the number of learned user preferences."""
        return self._count(select(func.count(UserPreference.id)))

    def count_recommendation_sessions(self) -> int:
        """Return the number of recommendation sessions."""
        return self._count(select(func.count(RecommendationSession.id)))

    def count_feedback(self) -> int:
        """Return the number of feedback records."""
        return self._count(select(func.count()).select_from(RecommendationFeedback))

    def get_last_embedding_update(self) -> Optional[datetime]:
        """Return the timestamp of the most recent embedding update."""
        last_embedding = self._session.exec(
            select(LoRAEmbedding).order_by(LoRAEmbedding.last_computed.desc()),
        ).first()

        if last_embedding is None:
            return None

        return last_embedding.last_computed

    def _count(self, stmt) -> int:
        result = self._session.exec(stmt).one()
        try:
            return result[0]
        except TypeError:
            return result


def _serialize_features(features: Mapping[str, Any]) -> dict[str, Any]:
    def serialize_embedding(value: Any) -> bytes | None:
        if value is None:
            return None
        return pickle.dumps(value)

    return {
        "semantic_embedding": serialize_embedding(features.get("semantic_embedding")),
        "artistic_embedding": serialize_embedding(features.get("artistic_embedding")),
        "technical_embedding": serialize_embedding(features.get("technical_embedding")),
        "extracted_keywords": list(features.get("extracted_keywords", [])),
        "keyword_scores": list(features.get("keyword_scores", [])),
        "predicted_style": features.get("predicted_style"),
        "style_confidence": features.get("style_confidence"),
        "sentiment_label": features.get("sentiment_label"),
        "sentiment_score": features.get("sentiment_score"),
        "quality_score": features.get("quality_score"),
        "popularity_score": features.get("popularity_score"),
        "recency_score": features.get("recency_score"),
        "compatibility_score": features.get("sd_compatibility_score"),
        "normalized_triggers": list(features.get("normalized_triggers", [])),
        "trigger_aliases": dict(features.get("trigger_aliases", {})),
        "trigger_embeddings": [
            list(map(float, embedding))
            for embedding in features.get("trigger_embeddings", [])
        ],
        "trigger_metadata": dict(features.get("trigger_metadata", {})),
    }
