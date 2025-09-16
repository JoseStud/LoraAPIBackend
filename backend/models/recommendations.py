"""Recommendation database models."""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import JSON, Column, LargeBinary, Text
from sqlmodel import Field, SQLModel


class RecommendationSession(SQLModel, table=True):
    """Track recommendation requests and their context."""
    
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    context_prompt: Optional[str] = Field(default=None, sa_column=Column(Text))
    active_loras: list = Field(default_factory=list, sa_column=Column(JSON))
    target_lora_id: Optional[str] = None
    recommendation_type: str = "similar"  # "similar", "for_prompt", "contextual"
    recommendations: list = Field(default_factory=list, sa_column=Column(JSON))
    user_feedback: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPreference(SQLModel, table=True):
    """Track learned user preferences."""
    
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    preference_type: str  # 'archetype', 'style', 'technical', 'author', 'tag'
    preference_value: str
    confidence: float = 0.5  # 0.0 to 1.0
    learned_from: str = "activation"  # 'activation', 'generation', 'explicit', 'feedback'
    evidence_count: int = 1  # Number of observations supporting this preference
    last_evidence_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LoRAEmbedding(SQLModel, table=True):
    """Store computed embeddings for LoRA adapters."""
    
    adapter_id: str = Field(primary_key=True, foreign_key="adapter.id")
    semantic_embedding: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    artistic_embedding: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    technical_embedding: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    extracted_keywords: list = Field(default_factory=list, sa_column=Column(JSON))
    keyword_scores: list = Field(default_factory=list, sa_column=Column(JSON))
    predicted_style: Optional[str] = None
    style_confidence: Optional[float] = None
    sentiment_label: Optional[str] = None
    sentiment_score: Optional[float] = None
    quality_score: Optional[float] = None
    popularity_score: Optional[float] = None
    recency_score: Optional[float] = None
    compatibility_score: Optional[float] = None
    last_computed: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RecommendationFeedback(SQLModel, table=True):
    """Store user feedback on recommendations for learning."""
    
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    session_id: str = Field(foreign_key="recommendationsession.id")
    recommended_lora_id: str = Field(foreign_key="adapter.id")
    feedback_type: str  # 'positive', 'negative', 'activated', 'ignored', 'dismissed'
    feedback_reason: Optional[str] = None  # User-provided reason
    implicit_signal: bool = False  # True if derived from behavior, False if explicit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
