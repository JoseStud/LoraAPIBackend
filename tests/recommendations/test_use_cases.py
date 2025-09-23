"""Tests for recommendation use cases."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services.recommendations import (
    PromptRecommendationUseCase,
    SimilarLoraUseCase,
)


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
