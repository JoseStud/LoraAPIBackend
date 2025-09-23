"""Feedback management helpers for recommendations."""

from __future__ import annotations

from backend.models import RecommendationFeedback, UserPreference
from backend.schemas.recommendations import (
    UserFeedbackRequest,
    UserPreferenceRequest,
)

from .interfaces import RecommendationRepository


class FeedbackManager:
    """Persist feedback and preferences through the repository."""

    def __init__(self, repository: RecommendationRepository) -> None:
        self._repository = repository

    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""

        return self._repository.record_feedback(feedback)

    def update_user_preference(
        self, preference: UserPreferenceRequest
    ) -> UserPreference:
        """Create or update a persisted user preference record."""

        return self._repository.update_user_preference(preference)
