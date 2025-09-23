"""Recommendation generation strategies."""

from __future__ import annotations

import asyncio
import pickle
import time
from typing import Dict, List, Optional

import numpy as np

from backend.schemas.recommendations import RecommendationItem

from .embedding_manager import EmbeddingManager
from .metrics import RecommendationMetricsTracker
from .repository import RecommendationRepository


async def get_similar_loras(
    *,
    target_lora_id: str,
    limit: int,
    similarity_threshold: float,
    weights: Optional[Dict[str, float]],
    repository: RecommendationRepository,
    embedding_manager: EmbeddingManager,
    engine,
    metrics: RecommendationMetricsTracker,
) -> List[RecommendationItem]:
    """Return LoRAs similar to the target LoRA."""

    start_time = time.time()

    target_lora = repository.get_adapter(target_lora_id)
    if target_lora is None:
        raise ValueError(f"LoRA {target_lora_id} not found")

    await embedding_manager.ensure_embeddings_exist([target_lora])

    if not getattr(engine, 'lora_ids', None):
        await embedding_manager.build_similarity_index()

    if not getattr(engine, 'lora_ids', None):
        metrics.record_query((time.time() - start_time) * 1000)
        return []

    recommendations = await asyncio.to_thread(
        engine.get_recommendations,
        target_lora,
        limit * 2,
        weights,
    )

    filtered_recommendations: List[RecommendationItem] = []
    for rec in recommendations:
        if rec['similarity_score'] < similarity_threshold:
            continue

        candidate_lora = repository.get_adapter(rec['lora_id'])
        if candidate_lora is None:
            continue

        filtered_recommendations.append(
            RecommendationItem(
                lora_id=rec['lora_id'],
                lora_name=candidate_lora.name,
                lora_description=candidate_lora.description,
                similarity_score=rec['similarity_score'],
                final_score=rec['final_score'],
                explanation=rec['explanation'],
                semantic_similarity=rec.get('semantic_similarity'),
                artistic_similarity=rec.get('artistic_similarity'),
                technical_similarity=rec.get('technical_similarity'),
                quality_boost=rec.get('quality_boost'),
                popularity_boost=rec.get('popularity_boost'),
                recency_boost=rec.get('recency_boost'),
                metadata={
                    'tags': candidate_lora.tags[:5],
                    'author': candidate_lora.author_username,
                    'sd_version': candidate_lora.sd_version,
                    'nsfw_level': candidate_lora.nsfw_level,
                },
            ),
        )

        if len(filtered_recommendations) >= limit:
            break

    metrics.record_query((time.time() - start_time) * 1000)
    return filtered_recommendations


async def get_recommendations_for_prompt(
    *,
    prompt: str,
    active_loras: Optional[List[str]],
    limit: int,
    style_preference: Optional[str],
    repository: RecommendationRepository,
    embedder,
    device: str,
    metrics: RecommendationMetricsTracker,
) -> List[RecommendationItem]:
    """Return LoRAs that enhance the provided prompt."""

    start_time = time.time()
    active_loras = active_loras or []

    prompt_embedding = await asyncio.to_thread(
        embedder.primary_model.encode,
        prompt,
        device=device,
        convert_to_numpy=True,
    )

    results = repository.get_active_loras_with_embeddings(exclude_ids=active_loras)

    recommendations: List[RecommendationItem] = []
    for adapter, embedding in results:
        if not embedding.semantic_embedding:
            continue

        lora_embedding = pickle.loads(embedding.semantic_embedding)

        prompt_norm = float(np.linalg.norm(prompt_embedding))
        lora_norm = float(np.linalg.norm(lora_embedding))
        denominator = prompt_norm * lora_norm
        if denominator == 0.0:
            similarity = 0.0
        else:
            similarity = float(np.dot(prompt_embedding, lora_embedding) / denominator)

        style_boost = 0.0
        if style_preference and embedding.predicted_style:
            if style_preference.lower() in embedding.predicted_style.lower():
                style_boost = 0.2

        final_score = similarity + style_boost

        explanation_parts = [f"Prompt similarity: {similarity:.2f}"]
        if style_boost > 0:
            explanation_parts.append(f"Style match: {embedding.predicted_style}")
        if adapter.tags:
            explanation_parts.append(f"Tags: {', '.join(adapter.tags[:3])}")

        recommendations.append(
            RecommendationItem(
                lora_id=adapter.id,
                lora_name=adapter.name,
                lora_description=adapter.description,
                similarity_score=similarity,
                final_score=final_score,
                explanation=" | ".join(explanation_parts),
                semantic_similarity=similarity,
                metadata={
                    'tags': adapter.tags[:5],
                    'author': adapter.author_username,
                    'sd_version': adapter.sd_version,
                    'nsfw_level': adapter.nsfw_level,
                    'predicted_style': embedding.predicted_style,
                },
            ),
        )

    recommendations.sort(key=lambda item: item.final_score, reverse=True)

    metrics.record_query((time.time() - start_time) * 1000)
    return recommendations[:limit]
