"""Tests for the embedding service: runtime, computation and the index."""

import pickle
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from backend.models import Adapter, LoRAEmbedding
from backend.services.recommendations import (
    EmbeddingService,
    RecommendationModelRegistry,
)


def _registry_with_engine(engine) -> MagicMock:
    registry = MagicMock()
    registry.get_recommendation_engine.return_value = engine
    return registry


class TestEmbeddingRuntime:
    """Runtime environment helpers."""

    def test_device_and_gpu_flag_come_from_registry(self):
        service = EmbeddingService(
            MagicMock(),
            RecommendationModelRegistry(gpu_enabled=False),
        )

        assert service.device == "cpu"
        assert service.gpu_enabled is False

    def test_preload_models_uses_detected_or_explicit_gpu_flag(self):
        with (
            patch.object(
                RecommendationModelRegistry, "preload", autospec=True
            ) as preload,
            patch.object(
                EmbeddingService, "is_gpu_available", return_value=True
            ) as available,
        ):
            EmbeddingService.preload_models(gpu_enabled=False)
            available.assert_not_called()
            assert preload.call_args.args[0].device == "cpu"

            EmbeddingService.preload_models()
            available.assert_called_once()
            assert preload.call_args.args[0].device == "cuda"
            assert preload.call_count == 2


class TestEmbeddingComputation:
    """Single-adapter and batch embedding computation."""

    def test_compute_for_lora_persists_extracted_features(
        self,
        repository,
        db_session,
        sample_adapter,
    ):
        db_session.add(sample_adapter)
        db_session.commit()

        vector = np.asarray([0.1, 0.2], dtype=np.float32)
        extractor = MagicMock()
        extractor.extract_advanced_features.return_value = {
            "semantic_embedding": vector,
            "normalized_triggers": ["angel"],
        }
        registry = MagicMock()
        registry.get_feature_extractor.return_value = extractor
        service = EmbeddingService(repository, registry)

        assert service.compute_for_lora(sample_adapter.id) is True

        stored = db_session.get(LoRAEmbedding, sample_adapter.id)
        assert stored is not None
        assert np.array_equal(pickle.loads(stored.semantic_embedding), vector)
        assert stored.normalized_triggers == ["angel"]

        # An existing embedding is kept unless recomputation is forced.
        assert service.compute_for_lora(sample_adapter.id) is True
        extractor.extract_advanced_features.assert_called_once()

    def test_compute_for_lora_rejects_unknown_adapter(self, repository):
        service = EmbeddingService(repository, MagicMock())

        with pytest.raises(ValueError):
            service.compute_for_lora("missing")

    def test_batch_compute_skips_existing_embeddings(
        self,
        repository,
        db_session,
        sample_adapter,
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
        db_session.add(
            LoRAEmbedding(
                adapter_id=sample_adapter.id,
                semantic_embedding=b"existing",
            ),
        )
        db_session.commit()

        service = EmbeddingService(repository, MagicMock())
        compute = MagicMock(return_value=True)

        with patch.object(service, "compute_for_lora", compute):
            result = service.compute_batch(force_recompute=False)

        assert result["skipped_count"] == 1
        assert result["processed_count"] == 1
        compute.assert_called_once_with("adapter-2", force_recompute=False)

    def test_batch_compute_reports_generic_errors(
        self,
        repository,
        db_session,
        sample_adapter,
    ):
        db_session.add(sample_adapter)
        db_session.commit()

        service = EmbeddingService(repository, MagicMock())
        compute = MagicMock(side_effect=RuntimeError("/secret/path missing"))

        with patch.object(service, "compute_for_lora", compute):
            result = service.compute_batch(force_recompute=True)

        assert result["error_count"] == 1
        assert result["errors"] == [
            {
                "adapter_id": sample_adapter.id,
                "error": "Embedding computation failed",
            },
        ]

    def test_ensure_embeddings_exist_computes_only_missing(
        self,
        repository,
        db_session,
        sample_adapter,
    ):
        other = Adapter(
            id="adapter-2",
            name="Adapter 2",
            description="",
            file_path="/tmp/a2.safetensors",
            active=True,
        )
        db_session.add(sample_adapter)
        db_session.add(other)
        db_session.add(
            LoRAEmbedding(adapter_id=sample_adapter.id, semantic_embedding=b"x"),
        )
        db_session.commit()

        service = EmbeddingService(repository, MagicMock())
        batch = MagicMock()

        with patch.object(service, "compute_batch", batch):
            service.ensure_embeddings_exist([sample_adapter, other])

        batch.assert_called_once_with(["adapter-2"])


class TestSimilarityIndex:
    """Building and persisting the similarity index."""

    def test_build_index_uses_active_adapters_with_embeddings(
        self,
        repository,
        db_session,
        sample_adapter,
    ):
        db_session.add(sample_adapter)
        db_session.add(
            LoRAEmbedding(adapter_id=sample_adapter.id, semantic_embedding=b"x"),
        )
        db_session.commit()

        engine = MagicMock()
        service = EmbeddingService(repository, _registry_with_engine(engine))

        service.build_similarity_index()

        (adapters,) = engine.build_similarity_index.call_args.args
        assert [adapter.id for adapter in adapters] == [sample_adapter.id]

    def test_skip_when_existing_index_present(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = ["existing"]
        service = EmbeddingService(
            MagicMock(),
            _registry_with_engine(engine),
            index_cache_path=tmp_path / "index.pkl",
        )

        result = service.refresh_similarity_index()

        assert result.skipped is True
        assert result.skipped_reason == "existing_index"
        assert result.index_path.endswith("index.pkl")

    def test_rebuild_persists_payload_to_disk(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = []

        def populate_index():
            engine.lora_ids = ["a", "b"]
            engine.semantic_embeddings = np.array([[1.0], [0.5]], dtype=np.float32)
            engine.artistic_embeddings = np.array([[0.2], [0.3]], dtype=np.float32)
            engine.technical_embeddings = np.array([[0.9], [0.1]], dtype=np.float32)

        index_path = tmp_path / "cache" / "rebuilt.pkl"
        service = EmbeddingService(
            MagicMock(),
            _registry_with_engine(engine),
            index_cache_path=index_path,
        )
        build = MagicMock(side_effect=populate_index)

        with patch.object(service, "build_similarity_index", build):
            result = service.refresh_similarity_index(force=True)

        assert result.status == "rebuilt"
        assert result.indexed_items == 2
        assert index_path.exists()
        with index_path.open("rb") as handle:
            assert pickle.load(handle)["lora_ids"] == ["a", "b"]
        build.assert_called_once()

    def test_empty_rebuild_removes_stale_index(self, tmp_path):
        engine = MagicMock()
        engine.lora_ids = []
        index_path = tmp_path / "index.pkl"
        index_path.write_bytes(b"stale")
        service = EmbeddingService(
            MagicMock(),
            _registry_with_engine(engine),
            index_cache_path=index_path,
        )

        with patch.object(service, "build_similarity_index", MagicMock()):
            result = service.refresh_similarity_index(force=True)

        assert result.status == "empty"
        assert not index_path.exists()
