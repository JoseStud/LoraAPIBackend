"""Persistence helpers for the recommendation service."""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple

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
        self._session = session

    # ------------------------------------------------------------------
    # Write operations
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
    # Read operations
    # ------------------------------------------------------------------
    def get_adapter(self, adapter_id: str) -> Optional[Adapter]:
        """Return an adapter by identifier."""
        return self._session.get(Adapter, adapter_id)

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

    def get_embedding(self, adapter_id: str) -> Optional[LoRAEmbedding]:
        """Return the embedding entry for ``adapter_id`` if present."""
        return self._session.get(LoRAEmbedding, adapter_id)

    def count_active_adapters(self) -> int:
        """Return the number of active adapters."""
        result = self._session.exec(
            select(func.count(Adapter.id)).where(Adapter.active),
        ).one()
        try:
            return result[0]
        except TypeError:
            return result

    def count_lora_embeddings(self) -> int:
        """Return the number of stored LoRA embeddings."""
        result = self._session.exec(
            select(func.count(LoRAEmbedding.adapter_id)),
        ).one()
        try:
            return result[0]
        except TypeError:
            return result

    def count_user_preferences(self) -> int:
        """Return the number of learned user preferences."""
        result = self._session.exec(
            select(func.count(UserPreference.id)),
        ).one()
        try:
            return result[0]
        except TypeError:
            return result

    def count_recommendation_sessions(self) -> int:
        """Return the number of recommendation sessions."""
        result = self._session.exec(
            select(func.count(RecommendationSession.id)),
        ).one()
        try:
            return result[0]
        except TypeError:
            return result

    def count_feedback(self) -> int:
        """Return the number of feedback records."""
        result = self._session.exec(
            select(func.count()).select_from(RecommendationFeedback),
        ).one()
        try:
            return result[0]
        except TypeError:
            return result

    def get_last_embedding_update(self) -> Optional[datetime]:
        """Return the timestamp of the most recent embedding update."""
        last_embedding = self._session.exec(
            select(LoRAEmbedding).order_by(LoRAEmbedding.last_computed.desc()),
        ).first()

        if last_embedding is None:
            return None

        return last_embedding.last_computed
