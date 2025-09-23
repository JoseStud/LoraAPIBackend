"""HTTP routes for LoRA recommendations."""

from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.core.dependencies import get_domain_services
from backend.schemas.recommendations import (
    BatchEmbeddingRequest,
    BatchEmbeddingResponse,
    EmbeddingStatus,
    IndexRebuildResponse,
    PromptRecommendationRequest,
    RecommendationFeedbackRead,
    RecommendationResponse,
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
    UserPreferenceRead,
)
from backend.services import DomainServices

router = APIRouter()


@router.get("/recommendations/similar/{lora_id}", response_model=RecommendationResponse)
async def get_similar_loras(
    lora_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    similarity_threshold: float = Query(default=0.1, ge=0.0, le=1.0),
    diversify_results: bool = Query(default=True),
    weights: Optional[Dict[str, float]] = None,
    services: DomainServices = Depends(get_domain_services),
):
    """Get LoRAs similar to the specified LoRA.
    
    Args:
        lora_id: ID of the target LoRA
        limit: Maximum number of recommendations to return
        similarity_threshold: Minimum similarity score (0.0 to 1.0)
        diversify_results: Whether to diversify results by different criteria
        weights: Custom weights for similarity components (semantic, artistic, technical)
        
    Returns:
        List of similar LoRA recommendations with similarity scores and explanations

    """
    try:
        start_time = datetime.now()
        
        # Generate recommendations
        recommendation_service = services.recommendations
        recommendations = await recommendation_service.similar_loras(
            target_lora_id=lora_id,
            limit=limit,
            similarity_threshold=similarity_threshold,
            weights=weights,
        )
        
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return RecommendationResponse(
            target_lora_id=lora_id,
            recommendations=recommendations,
            total_candidates=len(recommendations),
            processing_time_ms=processing_time,
            recommendation_config={
                'device': recommendation_service.device,
                'gpu_enabled': recommendation_service.gpu_enabled,
                'similarity_threshold': similarity_threshold,
                'weights': weights or {'semantic': 0.6, 'artistic': 0.3, 'technical': 0.1},
            },
            generated_at=datetime.now(timezone.utc),
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation generation failed: {e}")


@router.post("/recommendations/for-prompt", response_model=RecommendationResponse)
async def get_recommendations_for_prompt(
    request: PromptRecommendationRequest,
    services: DomainServices = Depends(get_domain_services),
):
    """Get LoRA recommendations that would enhance a given prompt.
    
    Args:
        request: Prompt recommendation request with prompt text and preferences
        
    Returns:
        List of LoRA recommendations optimized for the given prompt

    """
    try:
        start_time = datetime.now()
        
        # Generate recommendations
        recommendation_service = services.recommendations
        recommendations = await recommendation_service.recommend_for_prompt(
            prompt=request.prompt,
            active_loras=request.active_loras,
            limit=request.limit,
            style_preference=request.style_preference,
        )
        
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return RecommendationResponse(
            prompt=request.prompt,
            recommendations=recommendations,
            total_candidates=len(recommendations),
            processing_time_ms=processing_time,
            recommendation_config={
                'device': recommendation_service.device,
                'gpu_enabled': recommendation_service.gpu_enabled,
                'style_preference': request.style_preference,
                'technical_requirements': request.technical_requirements,
            },
            generated_at=datetime.now(timezone.utc),
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prompt recommendation failed: {e}")


@router.get("/recommendations/stats", response_model=RecommendationStats)
async def get_recommendation_stats(
    services: DomainServices = Depends(get_domain_services),
):
    """Get comprehensive statistics about the recommendation system.
    
    Returns:
        Statistics including coverage, performance metrics, and system status

    """
    try:
        recommendation_service = services.recommendations
        stats = recommendation_service.stats()
        return stats
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {e}")


@router.post("/recommendations/embeddings/compute", response_model=BatchEmbeddingResponse)
async def compute_embeddings(
    request: BatchEmbeddingRequest,
    services: DomainServices = Depends(get_domain_services),
):
    """Compute embeddings for LoRAs in batch.
    
    Args:
        request: Batch embedding request specifying which LoRAs to process
        
    Returns:
        Processing results with counts and timing information

    """
    try:
        recommendation_service = services.recommendations
        if request.compute_all:
            # Compute for all active LoRAs
            result = await recommendation_service.embeddings.compute_batch(
                adapter_ids=None,
                force_recompute=request.force_recompute,
                batch_size=request.batch_size,
            )
        else:
            # Compute for specific LoRAs
            result = await recommendation_service.embeddings.compute_batch(
                adapter_ids=request.adapter_ids,
                force_recompute=request.force_recompute,
                batch_size=request.batch_size,
            )
        
        return BatchEmbeddingResponse(**result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding computation failed: {e}")


@router.get("/recommendations/embeddings/{lora_id}", response_model=EmbeddingStatus)
async def get_embedding_status(
    lora_id: str,
    services: DomainServices = Depends(get_domain_services),
):
    """Get embedding status for a specific LoRA.
    
    Args:
        lora_id: ID of the LoRA to check
        
    Returns:
        Embedding status including what embeddings are available and when computed

    """
    try:
        recommendation_service = services.recommendations
        status = recommendation_service.embedding_status(lora_id)
        return status
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get embedding status: {e}")


@router.post("/recommendations/embeddings/{lora_id}/compute")
async def compute_single_embedding(
    lora_id: str,
    force_recompute: bool = Query(default=False),
    services: DomainServices = Depends(get_domain_services),
):
    """Compute embeddings for a single LoRA.
    
    Args:
        lora_id: ID of the LoRA to process
        force_recompute: Whether to recompute existing embeddings
        
    Returns:
        Success status

    """
    try:
        recommendation_service = services.recommendations
        success = await recommendation_service.embeddings.compute_for_lora(
            lora_id,
            force_recompute=force_recompute,
        )
        
        if success:
            return {"status": "success", "message": f"Embeddings computed for {lora_id}"}
        else:
            raise HTTPException(status_code=500, detail="Embedding computation failed")
            
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding computation failed: {e}")


@router.post("/recommendations/feedback", response_model=RecommendationFeedbackRead)
async def submit_recommendation_feedback(
    feedback: UserFeedbackRequest,
    services: DomainServices = Depends(get_domain_services),
):
    """Submit user feedback on recommendations for learning.

    Args:
        feedback: User feedback data

    Returns:
        Stored feedback record

    """
    try:
        recommendation_service = services.recommendations
        record = recommendation_service.feedback.record_feedback(feedback)
        return RecommendationFeedbackRead.from_orm(record)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback submission failed: {e}")


@router.post("/recommendations/preferences", response_model=UserPreferenceRead)
async def update_user_preferences(
    preference: UserPreferenceRequest,
    services: DomainServices = Depends(get_domain_services),
):
    """Update user preferences for personalized recommendations.

    Args:
        preference: User preference data

    Returns:
        Persisted preference record

    """
    try:
        recommendation_service = services.recommendations
        preference_record = recommendation_service.feedback.update_user_preference(preference)
        return UserPreferenceRead.from_orm(preference_record)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preference update failed: {e}")


@router.post(
    "/recommendations/index/rebuild",
    response_model=IndexRebuildResponse,
)
async def rebuild_similarity_index(
    force: bool = Query(default=False),
    services: DomainServices = Depends(get_domain_services),
):
    """Rebuild the similarity index for fast recommendations.
    
    Args:
        force: Force rebuild even if index exists

    Returns:
        Rebuild status and timing

    """
    try:
        recommendation_service = services.recommendations
        result = await recommendation_service.refresh_indexes(force=force)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Index rebuild failed: {e}")


@router.get("/recommendations/health")
async def get_recommendation_health(
    services: DomainServices = Depends(get_domain_services),
):
    """Get health status of the recommendation system.
    
    Returns:
        Health status including model availability and performance metrics

    """
    try:
        recommendation_service = services.recommendations
        stats = recommendation_service.stats()
        
        # Basic health checks
        health_status = {
            "status": "healthy",
            "checks": {
                "models_loaded": recommendation_service.models_loaded(),
                "embeddings_coverage": stats.embedding_coverage > 0.5,
                "performance_acceptable": stats.avg_recommendation_time_ms < 5000,
                "memory_usage_ok": stats.model_memory_usage_gb < 7.5,  # For 8GB VRAM
            },
            "metrics": {
                "embedding_coverage": stats.embedding_coverage,
                "avg_response_time_ms": stats.avg_recommendation_time_ms,
                "memory_usage_gb": stats.model_memory_usage_gb,
                "total_loras": stats.total_loras,
                "loras_with_embeddings": stats.loras_with_embeddings,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # Overall health determination
        all_checks_pass = all(health_status["checks"].values())
        health_status["status"] = "healthy" if all_checks_pass else "degraded"
        
        return health_status
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
