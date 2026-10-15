"""LoRA recommendations: queries, embeddings and the shared models behind them."""

from .embeddings import EmbeddingService
from .model_registry import RecommendationModelRegistry
from .repository import RecommendationRepository
from .service import DEFAULT_WEIGHTS, QueryMetrics, RecommendationService

__all__ = [
    "DEFAULT_WEIGHTS",
    "EmbeddingService",
    "QueryMetrics",
    "RecommendationModelRegistry",
    "RecommendationRepository",
    "RecommendationService",
]
