"""Integration-style tests for the recommendation service facade."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.schemas.recommendations import RecommendationStats
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.providers.recommendations import make_recommendation_service
from backend.services.recommendations import (
    EmbeddingCoordinator,
    EmbeddingStack,
    FeedbackManager,
    PersistenceComponents,
    RecommendationConfig,
    RecommendationMetricsTracker,
    RecommendationService,
    RecommendationServiceBuilder,
    StatsReporter,
    UseCaseBundle,
)


class TestRecommendationService:
    """Minimal smoke tests for the service wiring."""

    @pytest.mark.anyio("asyncio")
    async def test_service_facade_delegates_to_components(self):
        bootstrap = MagicMock()
        bootstrap.device = "cpu"
        bootstrap.gpu_enabled = False

        embedding_workflow = MagicMock()
        embedding_workflow.compute_embeddings_for_lora = AsyncMock(return_value=True)
        embedding_workflow.batch_compute_embeddings = AsyncMock(
            return_value={"processed": 1},
        )

        persistence_service = MagicMock()
        persistence_service.rebuild_similarity_index = AsyncMock(return_value="rebuilt")
        persistence_service.index_cache_path = "index.pkl"
        persistence_service.embedding_cache_dir = "embeddings"

        embedding_coordinator = EmbeddingCoordinator(
            bootstrap=bootstrap,
            embedding_workflow=embedding_workflow,
            persistence_service=persistence_service,
        )

        repository = MagicMock()
        repository.record_feedback.return_value = MagicMock()
        repository.update_user_preference.return_value = MagicMock()
        repository.count_active_adapters.return_value = 1
        repository.count_lora_embeddings.return_value = 1
        repository.count_user_preferences.return_value = 1
        repository.count_recommendation_sessions.return_value = 1
        repository.count_feedback.return_value = 0
        repository.get_last_embedding_update.return_value = datetime.now(timezone.utc)
        repository.get_embedding.return_value = MagicMock(
            semantic_embedding=b"sem",
            last_computed=datetime.now(timezone.utc),
        )

        feedback_manager = FeedbackManager(repository)
        stats_reporter = StatsReporter(
            metrics_tracker=RecommendationMetricsTracker(),
            repository=repository,
        )
        similar_use_case = MagicMock()
        similar_use_case.execute = AsyncMock(return_value=[MagicMock()])
        prompt_use_case = MagicMock()
        prompt_use_case.execute = AsyncMock(return_value=[MagicMock()])
        trigger_use_case = MagicMock()
        trigger_use_case.execute = AsyncMock(return_value=[MagicMock()])

        config = RecommendationConfig(persistence_service)

        service = (
            RecommendationServiceBuilder()
            .with_components(
                embedding_coordinator=embedding_coordinator,
                feedback_manager=feedback_manager,
                stats_reporter=stats_reporter,
                similar_lora_use_case=similar_use_case,
                prompt_recommendation_use_case=prompt_use_case,
                trigger_recommendation_use_case=trigger_use_case,
                config=config,
            )
            .build()
        )

        assert service.embeddings is embedding_coordinator
        assert service.feedback is feedback_manager
        assert service.reporter is stats_reporter

        await service.similar_loras(target_lora_id="adapter-1", limit=2)
        await service.similar_loras(
            target_lora_id="adapter-2",
            limit=3,
            diversify_results=False,
        )
        assert similar_use_case.execute.await_count == 2
        first_call_kwargs = similar_use_case.execute.await_args_list[0].kwargs
        second_call_kwargs = similar_use_case.execute.await_args_list[1].kwargs
        assert first_call_kwargs["diversify_results"] is True
        assert second_call_kwargs["diversify_results"] is False

        await service.recommend_for_prompt(prompt="hello", active_loras=["a"], limit=1)
        assert prompt_use_case.execute.await_count == 1

        await service.recommend_for_trigger(trigger_query="angel", limit=2)
        assert trigger_use_case.execute.await_count == 1

        await service.embeddings.compute_for_lora("adapter-1", force_recompute=True)
        embedding_workflow.compute_embeddings_for_lora.assert_awaited_with(
            "adapter-1",
            force_recompute=True,
        )

        await service.embeddings.compute_batch(adapter_ids=["adapter-1"], batch_size=8)
        embedding_workflow.batch_compute_embeddings.assert_awaited_with(
            ["adapter-1"],
            force_recompute=False,
            batch_size=8,
        )

        await service.refresh_indexes(force=True)
        persistence_service.rebuild_similarity_index.assert_awaited_with(force=True)

        feedback_payload = MagicMock()
        service.feedback.record_feedback(feedback_payload)
        repository.record_feedback.assert_called_once_with(feedback_payload)

        preference_payload = MagicMock()
        service.feedback.update_user_preference(preference_payload)
        repository.update_user_preference.assert_called_once_with(preference_payload)

        assert service.config.index_cache_path == "index.pkl"
        service.config.index_cache_path = "cache/index.pkl"
        assert persistence_service.index_cache_path == "cache/index.pkl"

        stats = service.stats()
        assert isinstance(stats, RecommendationStats)

        status = service.embedding_status("adapter-1")
        assert status.needs_recomputation is False

        assert service.gpu_enabled is False
        assert service.device == "cpu"

    def test_service_registry_builds_dependencies(self, db_session):
        builder = get_service_container_builder()
        services = builder.build(
            db_session,
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )
        service = services.recommendations

        assert isinstance(service, RecommendationService)
        assert service.device == "cpu"
        assert service.gpu_enabled is False

    def test_service_provider_uses_supplied_builder(self):
        db_session = MagicMock()

        bootstrap = MagicMock()
        bootstrap.device = "cpu"
        bootstrap.gpu_enabled = False
        bootstrap.get_model_registry.return_value = MagicMock()

        repository = MagicMock()

        embedding_stack = EmbeddingStack(
            repository=MagicMock(),
            manager=MagicMock(),
        )

        persistence_service = MagicMock()
        persistence_service.index_cache_path = "index"
        persistence_service.embedding_cache_dir = "embeddings"

        persistence_components = PersistenceComponents(
            manager=MagicMock(),
            service=persistence_service,
            config=RecommendationConfig(persistence_service),
        )

        metrics_tracker = RecommendationMetricsTracker()

        similar_use_case = MagicMock()
        prompt_use_case = MagicMock()
        trigger_use_case = MagicMock()
        use_case_bundle = UseCaseBundle(
            similar_lora=similar_use_case,
            prompt_recommendation=prompt_use_case,
            trigger_recommendation=trigger_use_case,
        )

        embedding_coordinator = MagicMock()
        embedding_coordinator.gpu_enabled = False
        embedding_coordinator.device = "cpu"

        feedback_manager = MagicMock()
        stats_reporter = MagicMock()

        builder = MagicMock()
        builder.with_components.return_value = builder
        expected_service = MagicMock()
        builder.build.return_value = expected_service

        service = make_recommendation_service(
            db_session,
            gpu_available=False,
            model_bootstrap=bootstrap,
            repository=repository,
            embedding_stack=embedding_stack,
            persistence_components=persistence_components,
            metrics_tracker=metrics_tracker,
            use_case_bundle=use_case_bundle,
            embedding_coordinator=embedding_coordinator,
            feedback_manager=feedback_manager,
            stats_reporter=stats_reporter,
            builder=builder,
        )

        assert service is expected_service
        builder.with_components.assert_called_once_with(
            embedding_coordinator=embedding_coordinator,
            feedback_manager=feedback_manager,
            stats_reporter=stats_reporter,
            similar_lora_use_case=similar_use_case,
            prompt_recommendation_use_case=prompt_use_case,
            trigger_recommendation_use_case=trigger_use_case,
            config=persistence_components.config,
        )
        builder.build.assert_called_once_with()
        bootstrap.get_model_registry.assert_called_once_with()
