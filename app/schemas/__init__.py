"""Pydantic schemas for request/response models."""

from .adapters import (
    AdapterCreate,
    AdapterListResponse,
    AdapterRead,
    AdapterWrapper,
)
from .common import (
    WebSocketMessage,
    WebSocketSubscription,
)
from .deliveries import (
    ComposeDelivery,
    ComposeDeliveryCLI,
    ComposeDeliveryHTTP,
    ComposeDeliveryInfo,
    ComposeRequest,
    ComposeResponse,
    DeliveryCreate,
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
)
from .generation import (
    ComposeDeliverySDNext,
    GenerationComplete,
    GenerationStarted,
    ProgressUpdate,
    SDNextDeliveryParams,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from .recommendations import (
    BatchEmbeddingRequest,
    BatchEmbeddingResponse,
    EmbeddingStatus,
    PromptRecommendationRequest,
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
    RecommendationStats,
    SimilarityRequest,
    UserFeedbackRequest,
    UserPreferenceRequest,
)

__all__ = [
    # Adapters
    "AdapterCreate",
    "AdapterRead", 
    "AdapterWrapper",
    "AdapterListResponse",
    # Deliveries
    "ComposeDeliveryHTTP",
    "ComposeDeliveryCLI",
    "ComposeDelivery",
    "ComposeDeliveryInfo",
    "ComposeResponse",
    "ComposeRequest",
    "DeliveryCreate",
    "DeliveryRead",
    "DeliveryWrapper",
    "DeliveryCreateResponse",
    # Generation
    "SDNextGenerationParams",
    "ComposeDeliverySDNext",
    "SDNextDeliveryParams",
    "SDNextGenerationResult",
    "ProgressUpdate",
    "GenerationStarted",
    "GenerationComplete",
    # Recommendations
    "RecommendationRequest",
    "RecommendationResponse",
    "RecommendationItem",
    "PromptRecommendationRequest",
    "SimilarityRequest",
    "UserFeedbackRequest",
    "UserPreferenceRequest",
    "RecommendationStats",
    "EmbeddingStatus",
    "BatchEmbeddingRequest",
    "BatchEmbeddingResponse",
    # Common
    "WebSocketMessage",
    "WebSocketSubscription",
]
