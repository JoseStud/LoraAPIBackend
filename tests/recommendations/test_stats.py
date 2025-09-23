"""Tests for recommendation metrics reporting."""

from datetime import datetime, timezone
from unittest.mock import MagicMock

from backend.models import (
    Adapter,
    LoRAEmbedding,
    RecommendationFeedback,
    RecommendationSession,
    UserPreference,
)
from backend.schemas.recommendations import RecommendationStats
from backend.services.recommendations import (
    RecommendationMetricsTracker,
    StatsReporter,
)


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

        reporter = StatsReporter(
            metrics_tracker=MagicMock(),
            repository=repository,
        )

        status = reporter.embedding_status(sample_adapter.id)

        assert status.needs_recomputation is False
        assert status.has_semantic_embedding is True


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
        db_session.add(
            UserPreference(
                preference_type="style",
                preference_value="anime",
            )
        )
        db_session.add(
            RecommendationSession(
                id="sess",
                context_prompt="",
                active_loras=[],
            )
        )
        db_session.add(
            RecommendationFeedback(
                session_id="sess",
                recommended_lora_id="adapter-stats",
                feedback_type="positive",
            )
        )
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
