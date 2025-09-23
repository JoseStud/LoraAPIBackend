"""Focused use cases for recommendation flows."""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional, Sequence

from backend.schemas.recommendations import RecommendationItem

from .components.interfaces import SemanticEmbedderProtocol
from .interfaces import (
    EmbeddingWorkflow,
    RecommendationMetricsTracker,
    RecommendationRepository,
)
from .strategies import (
    get_recommendations_for_prompt as prompt_strategy,
)
from .strategies import (
    get_similar_loras as similar_loras_strategy,
)


class SimilarLoraUseCase:
    """Resolve LoRA similarity queries against the recommendation engine."""

    def __init__(
        self,
        *,
        repository: RecommendationRepository,
        embedding_workflow: EmbeddingWorkflow,
        engine_provider: Callable[[], Any],
        metrics: RecommendationMetricsTracker,
    ) -> None:
        self._repository = repository
        self._embedding_workflow = embedding_workflow
        self._engine_provider = engine_provider
        self._metrics = metrics

    async def execute(
        self,
        *,
        target_lora_id: str,
        limit: int,
        similarity_threshold: float,
        weights: Optional[Dict[str, float]],
    ) -> List[RecommendationItem]:
        """Return LoRAs similar to ``target_lora_id`` while capturing metrics."""

        start = time.perf_counter()
        try:
            engine = self._engine_provider()
            return await similar_loras_strategy(
                target_lora_id=target_lora_id,
                limit=limit,
                similarity_threshold=similarity_threshold,
                weights=weights,
                repository=self._repository,
                embedding_manager=self._embedding_workflow,
                engine=engine,
            )
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self._metrics.record_query(elapsed_ms)


class PromptRecommendationUseCase:
    """Generate prompt-centric LoRA recommendations."""

    def __init__(
        self,
        *,
        repository: RecommendationRepository,
        embedder_provider: Callable[[], SemanticEmbedderProtocol],
        metrics: RecommendationMetricsTracker,
        device: str,
    ) -> None:
        self._repository = repository
        self._embedder_provider = embedder_provider
        self._metrics = metrics
        self._device = device

    async def execute(
        self,
        *,
        prompt: str,
        active_loras: Optional[Sequence[str]],
        limit: int,
        style_preference: Optional[str],
    ) -> List[RecommendationItem]:
        """Return LoRAs that enhance ``prompt`` while recording metrics."""

        start = time.perf_counter()
        try:
            embedder = self._embedder_provider()
            return await prompt_strategy(
                prompt=prompt,
                active_loras=list(active_loras) if active_loras else None,
                limit=limit,
                style_preference=style_preference,
                repository=self._repository,
                embedder=embedder,
                device=self._device,
            )
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self._metrics.record_query(elapsed_ms)
