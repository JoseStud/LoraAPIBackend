"""Tests for embedding coordination within the recommendation service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services.recommendations import (
    EmbeddingCoordinator,
    RecommendationModelBootstrap,
)


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
            "adapter-1",
            force_recompute=True,
        )

        await coordinator.compute_batch(["adapter-2"], batch_size=16)
        workflow.batch_compute_embeddings.assert_awaited_once_with(
            ["adapter-2"],
            force_recompute=False,
            batch_size=16,
        )

        await coordinator.refresh_similarity_index(force=True)
        persistence_service.rebuild_similarity_index.assert_awaited_once_with(
            force=True,
        )

    def test_gpu_helpers_delegate_to_bootstrap(self):
        with patch.object(
            RecommendationModelBootstrap,
            "is_gpu_available",
            return_value=True,
        ) as available:
            assert EmbeddingCoordinator.is_gpu_available() is True
            available.assert_called_once()

        with patch.object(
            RecommendationModelBootstrap,
            "preload_models_for_environment",
        ) as preload:
            EmbeddingCoordinator.preload_models(gpu_enabled=False)
            preload.assert_called_once_with(gpu_enabled=False)
