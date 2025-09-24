"""Recommendation generation strategies."""

from __future__ import annotations

import asyncio
import pickle
from typing import Dict, List, Optional

import numpy as np

from backend.schemas.recommendations import RecommendationItem

from .embedding_manager import EmbeddingManager
from .repository import RecommendationRepository


async def get_similar_loras(
    *,
    target_lora_id: str,
    limit: int,
    similarity_threshold: float,
    diversify_results: bool,
    weights: Optional[Dict[str, float]],
    repository: RecommendationRepository,
    embedding_manager: EmbeddingManager,
    engine,
) -> List[RecommendationItem]:
    """Return LoRAs similar to the target LoRA."""
    target_lora = repository.get_adapter(target_lora_id)
    if target_lora is None:
        raise ValueError(f"LoRA {target_lora_id} not found")

    await embedding_manager.ensure_embeddings_exist([target_lora])

    if not getattr(engine, "lora_ids", None):
        await embedding_manager.build_similarity_index()

    if not getattr(engine, "lora_ids", None):
        return []

    recommendations = await asyncio.to_thread(
        engine.get_recommendations,
        target_lora,
        limit * 2,
        weights,
        diversify_results,
    )

    filtered_recommendations: List[RecommendationItem] = []
    for rec in recommendations:
        if rec["similarity_score"] < similarity_threshold:
            continue

        candidate_lora = repository.get_adapter(rec["lora_id"])
        if candidate_lora is None:
            continue

        filtered_recommendations.append(
            RecommendationItem(
                lora_id=rec["lora_id"],
                lora_name=candidate_lora.name,
                lora_description=candidate_lora.description,
                similarity_score=rec["similarity_score"],
                final_score=rec["final_score"],
                explanation=rec["explanation"],
                semantic_similarity=rec.get("semantic_similarity"),
                artistic_similarity=rec.get("artistic_similarity"),
                technical_similarity=rec.get("technical_similarity"),
                quality_boost=rec.get("quality_boost"),
                popularity_boost=rec.get("popularity_boost"),
                recency_boost=rec.get("recency_boost"),
                metadata={
                    "tags": candidate_lora.tags[:5],
                    "author": candidate_lora.author_username,
                    "sd_version": candidate_lora.sd_version,
                    "nsfw_level": candidate_lora.nsfw_level,
                },
            ),
        )

        if len(filtered_recommendations) >= limit:
            break

    return filtered_recommendations


async def get_recommendations_for_prompt(
    *,
    prompt: str,
    active_loras: Optional[List[str]],
    limit: int,
    style_preference: Optional[str],
    weights: Dict[str, float],
    repository: RecommendationRepository,
    embedder,
    device: str,
) -> List[RecommendationItem]:
    """Return LoRAs that enhance the provided prompt."""
    active_loras = active_loras or []

    # Get embeddings for the prompt
    prompt_embeddings = await asyncio.to_thread(
        embedder.compute_prompt_embeddings, prompt, device
    )
    prompt_embedding = prompt_embeddings["semantic"]

    results = repository.get_active_loras_with_embeddings(exclude_ids=active_loras)

    recommendations: List[RecommendationItem] = []
    for adapter, embedding in results:
        if not all([
            embedding.semantic_embedding,
            embedding.artistic_embedding,
            embedding.technical_embedding,
        ]):
            continue

        # Unpack embeddings
        lora_semantic_embedding = pickle.loads(embedding.semantic_embedding)
        lora_artistic_embedding = pickle.loads(embedding.artistic_embedding)
        lora_technical_embedding = pickle.loads(embedding.technical_embedding)

        # Calculate multi-modal similarities
        semantic_similarity = _calculate_similarity(
            prompt_embedding, lora_semantic_embedding
        )
        artistic_similarity = _calculate_similarity(
            prompt_embeddings["artistic"], lora_artistic_embedding
        )
        technical_similarity = _calculate_similarity(
            prompt_embeddings["technical"], lora_technical_embedding
        )

        # Apply weights
        final_score = (
            semantic_similarity * weights.get("semantic", 1.0)
            + artistic_similarity * weights.get("artistic", 1.0)
            + technical_similarity * weights.get("technical", 1.0)
        )

        style_boost = 0.0
        if style_preference and embedding.predicted_style:
            if style_preference.lower() in embedding.predicted_style.lower():
                style_boost = 0.2
        final_score += style_boost

        explanation_parts = [
            f"Semantic: {semantic_similarity:.2f}",
            f"Artistic: {artistic_similarity:.2f}",
            f"Technical: {technical_similarity:.2f}",
        ]
        if style_boost > 0:
            explanation_parts.append(f"Style Match: {embedding.predicted_style}")

        recommendations.append(
            RecommendationItem(
                lora_id=adapter.id,
                lora_name=adapter.name,
                lora_description=adapter.description,
                similarity_score=semantic_similarity,  # Keep primary score semantic
                final_score=final_score,
                explanation=" | ".join(explanation_parts),
                semantic_similarity=semantic_similarity,
                artistic_similarity=artistic_similarity,
                technical_similarity=technical_similarity,
                metadata={
                    "tags": adapter.tags[:5],
                    "author": adapter.author_username,
                    "sd_version": adapter.sd_version,
                    "nsfw_level": adapter.nsfw_level,
                    "predicted_style": embedding.predicted_style,
                },
            )
        )

    recommendations.sort(key=lambda item: item.final_score, reverse=True)

    return recommendations[:limit]


def _calculate_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """Calculate cosine similarity between two numpy embeddings."""
    norm1 = np.linalg.norm(embedding1)
    norm2 = np.linalg.norm(embedding2)
    denominator = norm1 * norm2
    if denominator == 0.0:
        return 0.0
    return float(np.dot(embedding1, embedding2) / denominator)
