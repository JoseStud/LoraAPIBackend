"""Unit tests for recommendation service collaborators."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from backend.models import (
    Adapter,
    LoRAEmbedding,
    RecommendationFeedback,
    RecommendationSession,
    UserPreference,
)
from backend.schemas.recommendations import (
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
)
from backend.services import ServiceContainer
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.recommendations import (
    EmbeddingBatchRunner,
    EmbeddingCoordinator,
    FeedbackManager,
    LoRAEmbeddingRepository,
    PromptRecommendationUseCase,
    RecommendationConfig,
    RecommendationMetricsTracker,
    RecommendationModelBootstrap,
    RecommendationPersistenceManager,
    RecommendationPersistenceService,
    RecommendationRepository,
    RecommendationService,
    RecommendationServiceBuilder,
    SimilarLoraUseCase,
    StatsReporter,
)


@pytest.fixture(autouse=True)
def force_cpu_mode():
    """Ensure tests run with GPU detection disabled unless overridden."""
    with patch.object(
        RecommendationModelBootstrap, "is_gpu_available", return_value=False,
    ):
        yield


@pytest.fixture
def sample_adapter() -> Adapter:
    """Create a sample adapter for testing."""
    return Adapter(
        id="adapter-1",
        name="Adapter",
        description="Test adapter",
        file_path="/tmp/adapter.safetensors",
        active=True,
    )


@pytest.fixture
def repository(db_session):
    """Return a repository tied to the ephemeral session."""
    return RecommendationRepository(db_session)


@pytest.fixture
def model_registry(monkeypatch):
    from backend.services.recommendations.model_registry import (
        RecommendationModelRegistry,
    )

    monkeypatch.setattr(
        RecommendationModelRegistry, "_shared_semantic_embedder", None,
    )
    monkeypatch.setattr(
        RecommendationModelRegistry, "_shared_feature_extractor", None,
    )
    monkeypatch.setattr(
        RecommendationModelRegistry, "_shared_recommendation_engine", None,
    )

    return RecommendationModelRegistry


class TestRecommendationModelStatus:
    """Verify model loading status helpers."""

    def test_models_loaded_false_when_registry_empty(self, model_registry):
        assert RecommendationService.models_loaded() is False

    def test_models_loaded_true_when_registry_populated(
        self, model_registry, monkeypatch,
    ):
        monkeypatch.setattr(
            model_registry, "_shared_semantic_embedder", object(),
        )
        monkeypatch.setattr(
            model_registry, "_shared_feature_extractor", object(),
        )
        monkeypatch.setattr(
            model_registry, "_shared_recommendation_engine", object(),
        )

        assert RecommendationService.models_loaded() is True


class TestRecommendationPersistenceService:
    """Unit tests for the high level persistence helper."""

    @pytest.mark.anyio("asyncio")
    async def test_skip_when_existing_index_present(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = ["existing"]

        manager = RecommendationPersistenceManager(
            MagicMock(),
            lambda: engine,
            index_cache_path=tmp_path / "index.pkl",
        )
        service = RecommendationPersistenceService(manager)

        result = await service.rebuild_similarity_index()

        assert result.skipped is True
        assert service.index_cache_path.endswith("index.pkl")

    @pytest.mark.anyio("asyncio")
    async def test_rebuild_persists_payload_to_disk(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = []
        engine.semantic_embeddings = []
        engine.artistic_embeddings = []
        engine.technical_embeddings = []

        async def populate_index():
            engine.lora_ids = ["a", "b"]
            engine.semantic_embeddings = np.array([[1.0], [0.5]], dtype=np.float32)
            engine.artistic_embeddings = np.array([[0.2], [0.3]], dtype=np.float32)
            engine.technical_embeddings = np.array([[0.9], [0.1]], dtype=np.float32)

        embedding_manager = MagicMock()
        embedding_manager.build_similarity_index = AsyncMock(side_effect=populate_index)

        manager = RecommendationPersistenceManager(
            embedding_manager,
            lambda: engine,
            index_cache_path=tmp_path / "rebuilt.pkl",
        )
        service = RecommendationPersistenceService(manager)

        result = await service.rebuild_similarity_index(force=True)

        assert result.status == "rebuilt"
        assert (tmp_path / "rebuilt.pkl").exists()
        embedding_manager.build_similarity_index.assert_awaited_once()


class TestEmbeddingBatchRunner:
    """Targeted tests for the embedding batch runner."""

    @pytest.mark.anyio("asyncio")
    async def test_batch_compute_skips_existing_embeddings(
        self, db_session, sample_adapter,
    ):
        db_session.add(sample_adapter)
        db_session.add(
            Adapter(
                id="adapter-2",
                name="Adapter 2",
                description="",
                file_path="/tmp/a2.safetensors",
                active=True,
            ),
        )
        db_session.commit()

        repository = LoRAEmbeddingRepository(db_session)
        computer = MagicMock()
        computer.compute = AsyncMock(return_value=True)

        runner = EmbeddingBatchRunner(repository, computer)

        db_session.add(
            LoRAEmbedding(
                adapter_id=sample_adapter.id,
                semantic_embedding=b"existing",
            ),
        )
        db_session.commit()

        result = await runner.run(force_recompute=False)

        assert result["skipped_count"] == 1
        computer.compute.assert_awaited_once()
        computer.compute.assert_awaited_with("adapter-2", force_recompute=False)


class TestRecommendationRepository:
    """Verify repository persistence behaviour."""

    def test_record_feedback_persists_data(self, repository, db_session, sample_adapter):
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
        assert refreshed_session.user_feedback[sample_adapter.id]["feedback_type"] == "positive"

    def test_update_user_preference_creates_and_updates(self, repository, db_session):
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


class TestEmbeddingCoordinator:
    """Validate embedding coordinator behaviour."""

    @pytest.mark.anyio("asyncio")
    async def test_coordinates_runtime_and_workflows(self):
        bootstrap = MagicMock()
        bootstrap.device = "cpu"
        bootstrap.gpu_enabled = False

        workflow = MagicMock()
        workflow.compute_embeddings_for_lora = AsyncMock(return_value=True)
        workflow.batch_compute_embeddings = AsyncMock(return_value={"processed": 1})

        persistence_service = MagicMock()
        persistence_service.rebuild_similarity_index = AsyncMock(return_value="rebuilt")

        coordinator = EmbeddingCoordinator(
            bootstrap=bootstrap,
            embedding_workflow=workflow,
            persistence_service=persistence_service,
        )

        assert coordinator.device == "cpu"
        assert coordinator.gpu_enabled is False

        await coordinator.compute_for_lora("adapter-1", force_recompute=True)
        workflow.compute_embeddings_for_lora.assert_awaited_once_with(
            "adapter-1", force_recompute=True,
        )

        await coordinator.compute_batch(["adapter-2"], batch_size=16)
        workflow.batch_compute_embeddings.assert_awaited_once_with(
            ["adapter-2"], force_recompute=False, batch_size=16,
        )

        await coordinator.refresh_similarity_index(force=True)
        persistence_service.rebuild_similarity_index.assert_awaited_once_with(force=True)

    def test_gpu_helpers_delegate_to_bootstrap(self):
        with patch.object(
            RecommendationModelBootstrap, "is_gpu_available", return_value=True,
        ) as available:
            assert EmbeddingCoordinator.is_gpu_available() is True
            available.assert_called_once()

        with patch.object(
            RecommendationModelBootstrap,
            "preload_models_for_environment",
        ) as preload:
            EmbeddingCoordinator.preload_models(gpu_enabled=False)
            preload.assert_called_once_with(gpu_enabled=False)


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


class TestStatsReporter:
    """Verify stats reporter interactions."""

    def test_build_stats_uses_tracker(self):
        metrics_tracker = MagicMock()
        repository = MagicMock()
        reporter = StatsReporter(metrics_tracker=metrics_tracker, repository=repository)

        reporter.build_stats(gpu_enabled=True)
        metrics_tracker.build_stats.assert_called_once_with(
            repository,
            gpu_enabled=True,
        )

    def test_embedding_status_handles_missing(self, repository):
        reporter = StatsReporter(
            metrics_tracker=MagicMock(),
            repository=repository,
        )

        status = reporter.embedding_status("unknown")

        assert status.adapter_id == "unknown"
        assert status.needs_recomputation is True

    def test_embedding_status_for_existing_record(
        self, repository, db_session, sample_adapter,
    ):
        db_session.add(sample_adapter)
        db_session.add(
            LoRAEmbedding(
                adapter_id=sample_adapter.id,
                semantic_embedding=b"data",
                last_computed=datetime.now(timezone.utc),
            ),
        )
        db_session.commit()

        reporter = StatsReporter(
            metrics_tracker=MagicMock(),
            repository=repository,
        )

        status = reporter.embedding_status(sample_adapter.id)

        assert status.needs_recomputation is False
        assert status.has_semantic_embedding is True


class TestRecommendationUseCases:
    """Ensure focused use cases delegate correctly."""

    @pytest.mark.anyio("asyncio")
    async def test_similar_use_case_records_metrics(self):
        repository = MagicMock()
        workflow = MagicMock()
        engine_provider = MagicMock(return_value=MagicMock())
        metrics = MagicMock()
        use_case = SimilarLoraUseCase(
            repository=repository,
            embedding_workflow=workflow,
            engine_provider=engine_provider,
            metrics=metrics,
        )

        payload = [MagicMock()]
        strategy = AsyncMock(return_value=payload)

        with patch(
            "backend.services.recommendations.use_cases.similar_loras_strategy",
            strategy,
        ):
            result = await use_case.execute(
                target_lora_id="adapter-id",
                limit=5,
                similarity_threshold=0.3,
                diversify_results=True,
                weights=None,
            )

        assert result == payload
        strategy.assert_awaited_once_with(
            target_lora_id="adapter-id",
            limit=5,
            similarity_threshold=0.3,
            diversify_results=True,
            weights=None,
            repository=repository,
            embedding_manager=workflow,
            engine=engine_provider.return_value,
        )
        engine_provider.assert_called_once()
        metrics.record_query.assert_called_once()

    @pytest.mark.anyio("asyncio")
    async def test_prompt_use_case_records_metrics(self):
        repository = MagicMock()
        embedder_provider = MagicMock(return_value=MagicMock())
        metrics = MagicMock()
        use_case = PromptRecommendationUseCase(
            repository=repository,
            embedder_provider=embedder_provider,
            metrics=metrics,
            device="cpu",
        )

        payload = [MagicMock()]
        strategy = AsyncMock(return_value=payload)

        with patch(
            "backend.services.recommendations.use_cases.prompt_strategy",
            strategy,
        ):
            result = await use_case.execute(
                prompt="test",
                active_loras=["a"],
                limit=3,
                style_preference=None,
            )

        assert result == payload
        strategy.assert_awaited_once()
        embedder_provider.assert_called_once()
        metrics.record_query.assert_called_once()


class TestRecommendationMetricsTracker:
    """Ensure stats aggregation relies on the tracker."""

    def test_build_stats_uses_repository_counts(self, repository, db_session):
        now = datetime.now(timezone.utc)
        db_session.add(
            Adapter(
                id="adapter-stats",
                name="Stats",
                description="",
                file_path="/tmp/stats.safetensors",
                active=True,
            ),
        )
        db_session.add(
            LoRAEmbedding(
                adapter_id="adapter-stats",
                semantic_embedding=b"bytes",
                last_computed=now,
            ),
        )
        db_session.add(UserPreference(preference_type="style", preference_value="anime"))
        db_session.add(RecommendationSession(id="sess", context_prompt="", active_loras=[]))
        db_session.add(RecommendationFeedback(session_id="sess", recommended_lora_id="adapter-stats", feedback_type="positive"))
        db_session.commit()

        tracker = RecommendationMetricsTracker(memory_probe=lambda: 1.25)
        tracker.record_query(10.0)
        tracker.record_cache_hit()

        stats = tracker.build_stats(repository, gpu_enabled=True)

        assert isinstance(stats, RecommendationStats)
        assert stats.total_loras == 1
        assert stats.loras_with_embeddings == 1
        assert stats.cache_hit_rate == 1.0
        assert stats.model_memory_usage_gb == 1.25


class TestRecommendationService:
    """Minimal smoke tests for the service wiring."""

    @pytest.mark.anyio("asyncio")
    async def test_service_facade_delegates_to_components(self):
        bootstrap = MagicMock()
        bootstrap.device = "cpu"
        bootstrap.gpu_enabled = False

        embedding_workflow = MagicMock()
        embedding_workflow.compute_embeddings_for_lora = AsyncMock(return_value=True)
        embedding_workflow.batch_compute_embeddings = AsyncMock(return_value={"processed": 1})

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
            artistic_embedding=b"art",
            technical_embedding=b"tech",
            extracted_keywords=b"kw",
            last_computed=datetime.now(timezone.utc),
        )

        feedback_manager = FeedbackManager(repository)
        metrics_tracker = RecommendationMetricsTracker()
        stats_reporter = StatsReporter(
            metrics_tracker=metrics_tracker,
            repository=repository,
        )

        similar_use_case = MagicMock()
        similar_use_case.execute = AsyncMock(return_value=[MagicMock()])
        prompt_use_case = MagicMock()
        prompt_use_case.execute = AsyncMock(return_value=[MagicMock()])

        config = RecommendationConfig(persistence_service)

        service = (
            RecommendationServiceBuilder()
            .with_components(
                embedding_coordinator=embedding_coordinator,
                feedback_manager=feedback_manager,
                stats_reporter=stats_reporter,
                similar_lora_use_case=similar_use_case,
                prompt_recommendation_use_case=prompt_use_case,
                config=config,
            )
            .build()
        )

        assert service.embeddings is embedding_coordinator
        assert service.feedback is feedback_manager
        assert service.reporter is stats_reporter

        await service.similar_loras(target_lora_id="adapter-1", limit=2)
        await service.similar_loras(
            target_lora_id="adapter-2", limit=3, diversify_results=False,
        )
        assert similar_use_case.execute.await_count == 2
        first_call_kwargs = similar_use_case.execute.await_args_list[0].kwargs
        second_call_kwargs = similar_use_case.execute.await_args_list[1].kwargs
        assert first_call_kwargs["diversify_results"] is True
        assert second_call_kwargs["diversify_results"] is False

        await service.recommend_for_prompt(prompt="hello", active_loras=["a"], limit=1)
        assert prompt_use_case.execute.await_count == 1

        await service.embeddings.compute_for_lora("adapter-1", force_recompute=True)
        embedding_workflow.compute_embeddings_for_lora.assert_awaited_with(
            "adapter-1", force_recompute=True,
        )

        await service.embeddings.compute_batch(adapter_ids=["adapter-1"], batch_size=8)
        embedding_workflow.batch_compute_embeddings.assert_awaited_with(
            ["adapter-1"], force_recompute=False, batch_size=8,
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

    def test_service_container_builds_dependencies(self, db_session):
        container = ServiceContainer(
            db_session,
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )
        service = container.recommendations

        assert isinstance(service, RecommendationService)
        assert service.device == "cpu"
        assert service.gpu_enabled is False

    def test_service_from_legacy_dependencies_factory(self):
        bootstrap = MagicMock()
        bootstrap.device = "cpu"
        bootstrap.gpu_enabled = False

        model_registry = MagicMock()
        model_registry.get_recommendation_engine = MagicMock()
        model_registry.get_semantic_embedder = MagicMock()
        bootstrap.get_model_registry.return_value = model_registry

        repository = MagicMock()
        repository.record_feedback.return_value = MagicMock()
        repository.update_user_preference.return_value = MagicMock()
        repository.get_embedding.return_value = None

        embedding_workflow = MagicMock()
        embedding_workflow.compute_embeddings_for_lora = AsyncMock(return_value=True)
        embedding_workflow.batch_compute_embeddings = AsyncMock(return_value={"processed": 0})

        persistence_service = MagicMock()
        persistence_service.rebuild_similarity_index = AsyncMock(return_value="rebuilt")
        persistence_service.index_cache_path = "index"
        persistence_service.embedding_cache_dir = "embeddings"

        metrics_tracker = RecommendationMetricsTracker()

        service = RecommendationService.from_legacy_dependencies(
            bootstrap=bootstrap,
            repository=repository,
            embedding_workflow=embedding_workflow,
            persistence_service=persistence_service,
            metrics_tracker=metrics_tracker,
        )

        assert service.device == "cpu"
        assert service.gpu_enabled is False

        payload = MagicMock()
        service.feedback.record_feedback(payload)
        repository.record_feedback.assert_called_once_with(payload)

        status = service.embedding_status("missing")
        assert status.needs_recomputation is True
