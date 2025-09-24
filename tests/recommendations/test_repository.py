"""Tests for the recommendation repository."""

from backend.models import (
    RecommendationFeedback,
    RecommendationSession,
    UserPreference,
)
from backend.schemas.recommendations import (
    UserFeedbackRequest,
    UserPreferenceRequest,
)


class TestRecommendationRepository:
    """Verify repository persistence behaviour."""

    def test_record_feedback_persists_data(
        self,
        repository,
        db_session,
        sample_adapter,
    ):
        db_session.add(sample_adapter)
        session = RecommendationSession(
            id="session-1",
            context_prompt="prompt",
            active_loras=[sample_adapter.id],
        )
        db_session.add(session)
        db_session.commit()

        feedback_request = UserFeedbackRequest(
            session_id=session.id,
            recommended_lora_id=sample_adapter.id,
            feedback_type="positive",
            feedback_reason="helpful",
            implicit_signal=False,
        )

        record = repository.record_feedback(feedback_request)

        stored = db_session.get(RecommendationFeedback, record.id)
        assert stored is not None
        refreshed_session = db_session.get(RecommendationSession, session.id)
        assert (
            refreshed_session.user_feedback[sample_adapter.id]["feedback_type"]
            == "positive"
        )

    def test_update_user_preference_creates_and_updates(
        self,
        repository,
        db_session,
    ):
        payload = UserPreferenceRequest(
            preference_type="style",
            preference_value="anime",
            confidence=0.6,
            explicit=True,
        )

        first = repository.update_user_preference(payload)
        updated = repository.update_user_preference(
            UserPreferenceRequest(
                preference_type="style",
                preference_value="anime",
                confidence=0.9,
                explicit=False,
            ),
        )

        assert first.id == updated.id
        stored = db_session.get(UserPreference, first.id)
        assert stored.evidence_count == 2
        assert stored.learned_from == "feedback"
