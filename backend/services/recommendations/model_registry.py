"""Process-wide recommendation model instances."""

from __future__ import annotations

from threading import Lock
from typing import Optional

from structlog.stdlib import BoundLogger

from backend.core.logging import get_logger

from .encoders import TriggerEmbedder
from .engine import LoRARecommendationEngine
from .features import GPULoRAFeatureExtractor, LoRASemanticEmbedder
from .triggers import TriggerRecommendationEngine, TriggerResolver


class RecommendationModelRegistry:
    """Share recommendation models across every service instance in the process.

    Models live on the class so per-request services reuse them; they are
    rebuilt only when a registry for a different device asks for them.
    """

    _shared_lock: Lock = Lock()
    _shared_device: Optional[str] = None
    _shared_semantic_embedder: Optional[LoRASemanticEmbedder] = None
    _shared_feature_extractor: Optional[GPULoRAFeatureExtractor] = None
    _shared_recommendation_engine: Optional[LoRARecommendationEngine] = None
    _shared_trigger_embedder: Optional[TriggerEmbedder] = None
    _shared_trigger_resolver: Optional[TriggerResolver] = None
    _shared_trigger_engine: Optional[TriggerRecommendationEngine] = None

    def __init__(
        self,
        *,
        gpu_enabled: bool,
        logger: Optional[BoundLogger] = None,
    ) -> None:
        """Initialise registry state for the GPU or CPU device."""
        self.gpu_enabled = bool(gpu_enabled)
        self.device = "cuda" if self.gpu_enabled else "cpu"
        self._logger = logger or get_logger(__name__)

    def _ensure_ready(self) -> None:
        cls = type(self)
        logger = self._logger
        with cls._shared_lock:
            if cls._shared_device != self.device:
                cls._shared_semantic_embedder = None
                cls._shared_feature_extractor = None
                cls._shared_recommendation_engine = None
                cls._shared_device = self.device

            if cls._shared_trigger_resolver is None:
                cls._shared_trigger_resolver = TriggerResolver()

            if cls._shared_trigger_embedder is None:
                cls._shared_trigger_embedder = TriggerEmbedder(
                    device="cpu", logger=logger
                )

            if cls._shared_semantic_embedder is None:
                cls._shared_semantic_embedder = LoRASemanticEmbedder(
                    device=self.device,
                    batch_size=32 if self.gpu_enabled else 16,
                    logger=logger,
                )

            if cls._shared_feature_extractor is None:
                cls._shared_feature_extractor = GPULoRAFeatureExtractor(
                    device=self.device,
                    semantic_embedder=cls._shared_semantic_embedder,
                    logger=logger,
                    trigger_resolver=cls._shared_trigger_resolver,
                    trigger_embedder=cls._shared_trigger_embedder,
                )

            if cls._shared_recommendation_engine is None:
                cls._shared_recommendation_engine = LoRARecommendationEngine(
                    cls._shared_feature_extractor,
                    device=self.device,
                    logger=logger,
                )

            if cls._shared_trigger_engine is None:
                cls._shared_trigger_engine = TriggerRecommendationEngine(
                    resolver=cls._shared_trigger_resolver,
                    embedder=cls._shared_trigger_embedder,
                    logger=logger,
                )

    def preload(self) -> None:
        """Load every shared model for this registry's device."""
        self._ensure_ready()

    def get_semantic_embedder(self) -> LoRASemanticEmbedder:
        """Return the shared semantic embedder instance."""
        self._ensure_ready()
        assert type(self)._shared_semantic_embedder is not None
        return type(self)._shared_semantic_embedder

    def get_feature_extractor(self) -> GPULoRAFeatureExtractor:
        """Return the shared feature extractor instance."""
        self._ensure_ready()
        assert type(self)._shared_feature_extractor is not None
        return type(self)._shared_feature_extractor

    def get_recommendation_engine(self) -> LoRARecommendationEngine:
        """Return the shared recommendation engine instance."""
        self._ensure_ready()
        assert type(self)._shared_recommendation_engine is not None
        return type(self)._shared_recommendation_engine

    def get_trigger_engine(self) -> TriggerRecommendationEngine:
        """Return the shared trigger recommendation engine."""
        self._ensure_ready()
        assert type(self)._shared_trigger_engine is not None
        return type(self)._shared_trigger_engine

    @classmethod
    def models_loaded(cls) -> bool:
        """Return whether the shared models have been initialised."""
        return (
            cls._shared_semantic_embedder is not None
            and cls._shared_feature_extractor is not None
            and cls._shared_recommendation_engine is not None
        )
