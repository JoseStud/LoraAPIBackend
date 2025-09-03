"""Recommendation request/response schemas."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    """Request for LoRA recommendations."""
    
    target_lora_id: Optional[str] = None
    prompt: Optional[str] = None
    active_loras: List[str] = Field(default_factory=list)
    limit: int = Field(default=10, ge=1, le=50)
    include_explanations: bool = True
    weights: Optional[Dict[str, float]] = None
    filters: Optional[Dict[str, Any]] = None


class RecommendationItem(BaseModel):
    """Individual recommendation item."""
    
    lora_id: str
    lora_name: str
    lora_description: Optional[str] = None
    similarity_score: float
    final_score: float
    explanation: str
    semantic_similarity: Optional[float] = None
    artistic_similarity: Optional[float] = None
    technical_similarity: Optional[float] = None
    quality_boost: Optional[float] = None
    popularity_boost: Optional[float] = None
    recency_boost: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class RecommendationResponse(BaseModel):
    """Response containing recommendations."""
    
    target_lora_id: Optional[str] = None
    prompt: Optional[str] = None
    recommendations: List[RecommendationItem]
    total_candidates: int
    processing_time_ms: float
    recommendation_config: Dict[str, Any]
    generated_at: datetime


class PromptRecommendationRequest(BaseModel):
    """Request for prompt-based recommendations."""
    
    prompt: str
    active_loras: List[str] = Field(default_factory=list)
    limit: int = Field(default=10, ge=1, le=50)
    include_explanations: bool = True
    style_preference: Optional[str] = None
    technical_requirements: Optional[Dict[str, Any]] = None


class SimilarityRequest(BaseModel):
    """Request for similar LoRA recommendations."""
    
    target_lora_id: str
    limit: int = Field(default=10, ge=1, le=50)
    include_explanations: bool = True
    similarity_threshold: float = Field(default=0.1, ge=0.0, le=1.0)
    diversify_results: bool = True


class UserFeedbackRequest(BaseModel):
    """User feedback on recommendations."""
    
    session_id: str
    recommended_lora_id: str
    feedback_type: str = Field(pattern="^(positive|negative|activated|ignored|dismissed)$")
    feedback_reason: Optional[str] = None
    implicit_signal: bool = False


class UserPreferenceRequest(BaseModel):
    """Request to update user preferences."""
    
    preference_type: str = Field(pattern="^(archetype|style|technical|author|tag)$")
    preference_value: str
    confidence: float = Field(ge=0.0, le=1.0)
    explicit: bool = True


class RecommendationStats(BaseModel):
    """Statistics about the recommendation system."""
    
    total_loras: int
    loras_with_embeddings: int
    embedding_coverage: float
    avg_recommendation_time_ms: float
    cache_hit_rate: float
    total_sessions: int
    user_preferences_count: int
    feedback_count: int
    model_memory_usage_gb: float
    last_index_update: datetime


class EmbeddingStatus(BaseModel):
    """Status of embedding computation for a LoRA."""
    
    adapter_id: str
    has_semantic_embedding: bool
    has_artistic_embedding: bool
    has_technical_embedding: bool
    has_extracted_features: bool
    last_computed: Optional[datetime] = None
    needs_recomputation: bool = False


class BatchEmbeddingRequest(BaseModel):
    """Request to compute embeddings for multiple LoRAs."""
    
    adapter_ids: List[str] = Field(default_factory=list)
    force_recompute: bool = False
    compute_all: bool = False
    batch_size: int = Field(default=32, ge=1, le=128)


class BatchEmbeddingResponse(BaseModel):
    """Response for batch embedding computation."""
    
    processed_count: int
    skipped_count: int
    error_count: int
    processing_time_seconds: float
    errors: List[Dict[str, str]] = Field(default_factory=list)
    completed_at: datetime
