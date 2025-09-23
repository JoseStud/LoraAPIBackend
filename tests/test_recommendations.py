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
from backend.services.recommendations import (
    EmbeddingManager,
    RecommendationMetricsTracker,
    RecommendationModelBootstrap,
    RecommendationPersistenceManager,
    RecommendationPersistenceService,
    RecommendationRepository,
    RecommendationService,
)


@pytest.fixture(autouse=True)
def force_cpu_mode():
    """Ensure tests run with GPU detection disabled unless overridden."""

    with patch.object(
        RecommendationModelBootstrap, "is_gpu_available", return_value=False
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


class TestEmbeddingWorkflow:
    """Targeted tests for the embedding workflow interface."""

    @pytest.mark.anyio("asyncio")
    async def test_batch_compute_skips_existing_embeddings(
        self, db_session, sample_adapter
    ):
        db_session.add(sample_adapter)
        db_session.add(
            Adapter(
                id="adapter-2",
                name="Adapter 2",
                description="",
                file_path="/tmp/a2.safetensors",
                active=True,
            )
        )
        db_session.commit()

        compute_mock = AsyncMock(return_value=True)
        registry = MagicMock()
        registry.get_feature_extractor.return_value = MagicMock()
        registry.get_recommendation_engine.return_value = MagicMock()

        manager = EmbeddingManager(
            db_session,
            registry,
            single_embedding_compute=compute_mock,
        )

        db_session.add(
            LoRAEmbedding(
                adapter_id=sample_adapter.id,
                semantic_embedding=b"existing",
            )
        )
        db_session.commit()

        result = await manager.batch_compute_embeddings(force_recompute=False)

        assert result["skipped_count"] == 1
        compute_mock.assert_awaited()


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
            )
        )

        assert first.id == updated.id
        stored = db_session.get(UserPreference, first.id)
        assert stored.evidence_count == 2
        assert stored.learned_from == "feedback"


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
            )
        )
        db_session.add(
            LoRAEmbedding(
                adapter_id="adapter-stats",
                semantic_embedding=b"bytes",
                last_computed=now,
            )
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

    def test_service_uses_injected_dependencies(self):
        bootstrap = MagicMock()
        bootstrap.get_model_registry.return_value = MagicMock()
        bootstrap.gpu_enabled = False
        bootstrap.device = "cpu"

        repository = MagicMock()
        embedding_workflow = MagicMock()
        persistence_service = MagicMock()
        metrics_tracker = MagicMock(spec=RecommendationMetricsTracker)

        service = RecommendationService(
            bootstrap=bootstrap,
            repository=repository,
            embedding_workflow=embedding_workflow,
            persistence_service=persistence_service,
            metrics_tracker=metrics_tracker,
        )

        service.index_cache_path
        service.embedding_cache_dir
        persistence_service.index_cache_path = "cache/index.pkl"
        persistence_service.embedding_cache_dir = "cache/embeddings"

        service.record_feedback(MagicMock())
        repository.record_feedback.assert_called()

    def test_service_container_builds_dependencies(self, db_session):
        container = ServiceContainer(db_session)
        service = container.recommendations

        assert isinstance(service, RecommendationService)
        assert service.device == "cpu"
