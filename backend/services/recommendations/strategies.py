"""Recommendation generation strategies."""

from __future__ import annotations

import asyncio
import pickle
from typing import Any, Dict, List, Optional

import numpy as np

from backend.schemas.recommendations import RecommendationItem

from .embedding_manager import EmbeddingManager
from .repository import RecommendationRepository
from .trigger_engine import TriggerRecommendationEngine


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


async def get_recommendations_for_trigger(
    *,
    trigger_query: str,
    limit: int,
    repository: RecommendationRepository,
    trigger_engine: TriggerRecommendationEngine,
    logger,
) -> List[RecommendationItem]:
    """Return LoRAs that match a trigger-centric query."""
    candidates = trigger_engine.search(repository, trigger_query, limit * 2)
    metadata_cache = trigger_engine.metadata
    recommendations: List[RecommendationItem] = []
    seen: set[str] = set()

    def build_metadata(adapter) -> Dict[str, Any]:
        return {
            "id": adapter.id,
            "name": adapter.name,
            "description": adapter.description,
            "author_username": adapter.author_username,
            "tags": list(adapter.tags or [])[:5],
            "sd_version": adapter.sd_version,
            "nsfw_level": adapter.nsfw_level,
            "stats": adapter.stats or {},
            "predicted_style": None,
            "trigger_aliases": {},
            "trigger_sources": {},
            "trigger_confidence": {},
            "normalized_triggers": list(getattr(adapter, "triggers", []) or []),
        }

    for candidate in candidates:
        adapter_meta = metadata_cache.get(candidate.adapter_id)
        if adapter_meta is None:
            adapter = repository.get_adapter(candidate.adapter_id)
            if adapter is None:
                continue
            adapter_meta = build_metadata(adapter)
        seen.add(candidate.adapter_id)

        explanation_parts = [candidate.explanation]
        trigger_sources = (
            adapter_meta.get("trigger_sources", {}).get(
                candidate.canonical_trigger or "", []
            )
        )
        if trigger_sources:
            explanation_parts.append(
                f"Sources: {', '.join(sorted(set(trigger_sources))[:3])}"
            )
        confidence_map = adapter_meta.get("trigger_confidence", {}) or {}
        confidence_value = None
        if candidate.canonical_trigger:
            confidence_value = confidence_map.get(candidate.canonical_trigger)
            if confidence_value is not None:
                explanation_parts.append(f"Confidence: {confidence_value:.2f}")

        style_boost = 0.0
        predicted_style = adapter_meta.get("predicted_style")
        if predicted_style and trigger_query.lower() in str(predicted_style).lower():
            style_boost = 0.05
            explanation_parts.append(f"Style hint: {predicted_style}")

        popularity_boost = 0.0
        stats = adapter_meta.get("stats") or {}
        downloads = stats.get("downloadCount") or stats.get("downloads")
        if downloads:
            if downloads > 10000:
                popularity_boost = 0.1
            elif downloads > 1000:
                popularity_boost = 0.05
        if popularity_boost:
            explanation_parts.append("Popularity boost applied")

        final_score = candidate.final_score + style_boost + popularity_boost

        recommendations.append(
            RecommendationItem(
                lora_id=adapter_meta["id"],
                lora_name=str(adapter_meta.get("name", "")),
                lora_description=adapter_meta.get("description"),
                similarity_score=candidate.similarity_score,
                final_score=final_score,
                explanation=" | ".join(explanation_parts),
                semantic_similarity=candidate.signals.get("semantic"),
                artistic_similarity=None,
                technical_similarity=None,
                quality_boost=None,
                popularity_boost=popularity_boost or None,
                recency_boost=None,
                metadata={
                    "tags": adapter_meta.get("tags", []),
                    "author": adapter_meta.get("author_username"),
                    "sd_version": adapter_meta.get("sd_version"),
                    "nsfw_level": adapter_meta.get("nsfw_level"),
                    "trigger": candidate.canonical_trigger,
                    "trigger_sources": trigger_sources,
                    "trigger_confidence": confidence_value,
                    "predicted_style": predicted_style,
                },
            )
        )

        if len(recommendations) >= limit:
            break

    if len(recommendations) < limit:
        fallback_needed = limit - len(recommendations)
        try:
            fallbacks = repository.get_recent_active_adapters(fallback_needed * 2)
        except AttributeError:
            fallbacks = []
        fallback_count = 0
        for adapter in fallbacks:
            if adapter.id in seen:
                continue
            explanation = "Fallback suggestion: trending LoRA"
            metadata = {
                "tags": list(adapter.tags or [])[:5],
                "author": adapter.author_username,
                "sd_version": adapter.sd_version,
                "nsfw_level": adapter.nsfw_level,
                "trigger": None,
                "trigger_sources": [],
                "trigger_confidence": None,
                "predicted_style": getattr(adapter, "predicted_style", None),
            }
            recommendations.append(
                RecommendationItem(
                    lora_id=adapter.id,
                    lora_name=adapter.name,
                    lora_description=adapter.description,
                    similarity_score=0.0,
                    final_score=0.0,
                    explanation=explanation,
                    semantic_similarity=None,
                    artistic_similarity=None,
                    technical_similarity=None,
                    quality_boost=None,
                    popularity_boost=None,
                    recency_boost=None,
                    metadata=metadata,
                )
            )
            fallback_count += 1
            if len(recommendations) >= limit:
                break
        if fallback_count and logger:
            logger.info(
                "Trigger fallback supplied %s items for query '%s'",
                fallback_count,
                trigger_query,
            )

    return recommendations[:limit]


def _calculate_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """Calculate cosine similarity between two numpy embeddings."""
    norm1 = np.linalg.norm(embedding1)
    norm2 = np.linalg.norm(embedding2)
    denominator = norm1 * norm2
    if denominator == 0.0:
        return 0.0
    return float(np.dot(embedding1, embedding2) / denominator)
