"""Reusable components for recommendation services."""

from .embedder import LoRASemanticEmbedder
from .engine import LoRARecommendationEngine
from .feature_extractor import GPULoRAFeatureExtractor
from .interfaces import (
    FeatureExtractorProtocol,
    RecommendationEngineProtocol,
    SemanticEmbedderProtocol,
)
from .sentence_transformer_provider import SentenceTransformerProvider
from .trigger_embedder import TriggerEmbedder
from .trigger_processing import TriggerResolver
from .text_payload_builder import MultiModalTextPayloadBuilder

__all__ = [
    "FeatureExtractorProtocol",
    "GPULoRAFeatureExtractor",
    "LoRARecommendationEngine",
    "RecommendationEngineProtocol",
    "SemanticEmbedderProtocol",
    "LoRASemanticEmbedder",
    "MultiModalTextPayloadBuilder",
    "SentenceTransformerProvider",
    "TriggerEmbedder",
    "TriggerResolver",
]
