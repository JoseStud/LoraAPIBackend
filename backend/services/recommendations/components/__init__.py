"""Reusable components for recommendation services."""

from .embedder import LoRASemanticEmbedder
from .engine import LoRARecommendationEngine
from .feature_extractor import GPULoRAFeatureExtractor
from .interfaces import (
    FeatureExtractorProtocol,
    RecommendationEngineProtocol,
    SemanticEmbedderProtocol,
)

__all__ = [
    "FeatureExtractorProtocol",
    "GPULoRAFeatureExtractor",
    "LoRARecommendationEngine",
    "RecommendationEngineProtocol",
    "SemanticEmbedderProtocol",
    "LoRASemanticEmbedder",
]
