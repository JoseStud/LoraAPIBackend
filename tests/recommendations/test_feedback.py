"""Tests for the feedback manager wrapper."""

from unittest.mock import MagicMock

from backend.services.recommendations import FeedbackManager


class TestFeedbackManager:
    """Ensure feedback manager proxies to the repository."""

    def test_delegates_to_repository(self):
        repository = MagicMock()
        manager = FeedbackManager(repository)

        feedback_request = MagicMock()
        manager.record_feedback(feedback_request)
        repository.record_feedback.assert_called_once_with(feedback_request)

        preference_request = MagicMock()
        manager.update_user_preference(preference_request)
        repository.update_user_preference.assert_called_once_with(preference_request)
