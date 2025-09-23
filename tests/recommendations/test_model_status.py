"""Tests for recommendation model status helpers."""

from backend.services.recommendations import RecommendationService


class TestRecommendationModelStatus:
    """Verify model loading status helpers."""

    def test_models_loaded_false_when_registry_empty(self, model_registry):
        assert RecommendationService.models_loaded() is False

    def test_models_loaded_true_when_registry_populated(
        self,
        model_registry,
        monkeypatch,
    ):
        monkeypatch.setattr(
            model_registry,
            "_shared_semantic_embedder",
            object(),
        )
        monkeypatch.setattr(
            model_registry,
            "_shared_feature_extractor",
            object(),
        )
        monkeypatch.setattr(
            model_registry,
            "_shared_recommendation_engine",
            object(),
        )

        assert RecommendationService.models_loaded() is True
