"""Persistence helpers for the recommendation service."""

from datetime import datetime, timezone
from typing import Dict

from sqlmodel import Session, select

from backend.models import (
    Adapter,
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

    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""
        recommendation_session = self._session.get(RecommendationSession, feedback.session_id)
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
            'feedback_type': feedback.feedback_type,
            'implicit_signal': feedback.implicit_signal,
            'feedback_reason': feedback.feedback_reason,
            'recorded_at': datetime.now(timezone.utc).isoformat(),
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
        learned_from = 'explicit' if preference.explicit else 'feedback'

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
