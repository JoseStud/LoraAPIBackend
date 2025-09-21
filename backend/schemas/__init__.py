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
    GenerationCancelResponse,
    GenerationJobStatus,
    GenerationResultSummary,
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
    IndexRebuildResponse,
    PromptRecommendationRequest,
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
    RecommendationStats,
    SimilarityRequest,
    RecommendationFeedbackRead,
    UserFeedbackRequest,
    UserPreferenceRequest,
    UserPreferenceRead,
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
    "ComposeDeliverySDNext",
    # Generation
    "SDNextGenerationParams",
    "SDNextDeliveryParams",
    "SDNextGenerationResult",
    "ProgressUpdate",
    "GenerationStarted",
    "GenerationComplete",
    "GenerationJobStatus",
    "GenerationCancelResponse",
    "GenerationResultSummary",
    # Recommendations
    "RecommendationRequest",
    "RecommendationResponse",
    "RecommendationItem",
    "PromptRecommendationRequest",
    "SimilarityRequest",
    "UserFeedbackRequest",
    "UserPreferenceRequest",
    "RecommendationFeedbackRead",
    "UserPreferenceRead",
    "RecommendationStats",
    "EmbeddingStatus",
    "BatchEmbeddingRequest",
    "BatchEmbeddingResponse",
    "IndexRebuildResponse",
    # Common
    "WebSocketMessage",
    "WebSocketSubscription",
]
