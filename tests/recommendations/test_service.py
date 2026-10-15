"""Wiring tests for the recommendation service."""

from unittest.mock import MagicMock

from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.providers.recommendations import make_recommendation_service
from backend.services.recommendations import (
    EmbeddingService,
    RecommendationModelRegistry,
    RecommendationService,
)


class TestRecommendationService:
    """Minimal smoke tests for the service wiring."""

    def test_feedback_and_preferences_go_to_repository(self):
        repository = MagicMock()
        registry = RecommendationModelRegistry(gpu_enabled=False)
        service = RecommendationService(
            repository=repository,
            embeddings=EmbeddingService(repository, registry),
            model_registry=registry,
        )

        feedback_payload = MagicMock()
        assert (
            service.record_feedback(feedback_payload)
            is repository.record_feedback.return_value
        )
        repository.record_feedback.assert_called_once_with(feedback_payload)

        preference_payload = MagicMock()
        assert (
            service.update_user_preference(preference_payload)
            is repository.update_user_preference.return_value
        )
        repository.update_user_preference.assert_called_once_with(preference_payload)

    def test_service_registry_builds_dependencies(self, db_session):
        builder = get_service_container_builder()
        services = builder.build(
            db_session,
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )
        service = services.recommendations

        assert isinstance(service, RecommendationService)
        assert isinstance(service.embeddings, EmbeddingService)
        assert service.device == "cpu"
        assert service.gpu_enabled is False

    def test_service_provider_wires_shared_registry(self):
        service = make_recommendation_service(MagicMock(), gpu_available=True)

        assert isinstance(service, RecommendationService)
        assert isinstance(service.embeddings, EmbeddingService)
        assert service.device == "cuda"
        assert service.gpu_enabled is True
        assert service.embeddings.device == "cuda"
