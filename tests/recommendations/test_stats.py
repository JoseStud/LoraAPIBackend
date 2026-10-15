"""Tests for recommendation statistics and embedding status."""

from datetime import datetime, timezone
from unittest.mock import patch

from backend.models import (
    Adapter,
    LoRAEmbedding,
    RecommendationFeedback,
    RecommendationSession,
    UserPreference,
)
from backend.schemas.recommendations import RecommendationStats
from backend.services.recommendations import (
    EmbeddingService,
    QueryMetrics,
    RecommendationModelRegistry,
    RecommendationService,
)


def _service(repository, *, gpu_enabled=False, metrics=None):
    registry = RecommendationModelRegistry(gpu_enabled=gpu_enabled)
    return RecommendationService(
        repository=repository,
        embeddings=EmbeddingService(repository, registry),
        model_registry=registry,
        metrics=metrics,
    )


class TestEmbeddingStatus:
    """Verify embedding status reporting."""

    def test_embedding_status_handles_missing(self, repository):
        status = _service(repository).embedding_status("unknown")

        assert status.adapter_id == "unknown"
        assert status.needs_recomputation is True
        assert status.has_semantic_embedding is False

    def test_embedding_status_for_existing_record(
        self,
        repository,
        db_session,
        sample_adapter,
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

        status = _service(repository).embedding_status(sample_adapter.id)

        assert status.needs_recomputation is False
        assert status.has_semantic_embedding is True


class TestRecommendationStats:
    """Ensure stats combine repository counts, query timings and GPU memory."""

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
        db_session.add(
            UserPreference(
                preference_type="style",
                preference_value="anime",
            ),
        )
        db_session.add(
            RecommendationSession(
                id="sess",
                context_prompt="",
                active_loras=[],
            ),
        )
        db_session.add(
            RecommendationFeedback(
                session_id="sess",
                recommended_lora_id="adapter-stats",
                feedback_type="positive",
            ),
        )
        db_session.commit()

        metrics = QueryMetrics()
        metrics.record_query(10.0)
        service = _service(repository, gpu_enabled=True, metrics=metrics)

        with patch.object(EmbeddingService, "gpu_memory_usage_gb", return_value=1.25):
            stats = service.stats()

        assert isinstance(stats, RecommendationStats)
        assert stats.total_loras == 1
        assert stats.loras_with_embeddings == 1
        assert stats.embedding_coverage == 1.0
        assert stats.user_preferences_count == 1
        assert stats.total_sessions == 1
        assert stats.feedback_count == 1
        assert stats.avg_recommendation_time_ms == 10.0
        assert stats.cache_hit_rate == 0.0
        assert stats.model_memory_usage_gb == 1.25

    def test_memory_probe_skipped_without_gpu(self, repository):
        service = _service(repository, gpu_enabled=False)

        with patch.object(EmbeddingService, "gpu_memory_usage_gb") as probe:
            stats = service.stats()

        probe.assert_not_called()
        assert stats.model_memory_usage_gb == 0.0
        assert stats.total_loras == 0
        assert stats.embedding_coverage == 0.0
