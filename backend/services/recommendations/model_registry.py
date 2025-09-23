"""Shared model registry for recommendation workflows."""

from __future__ import annotations

import logging
from threading import Lock
from typing import Optional

from .components import (
    GPULoRAFeatureExtractor,
    LoRARecommendationEngine,
    LoRASemanticEmbedder,
)
from .components.interfaces import (
    FeatureExtractorProtocol,
    RecommendationEngineProtocol,
    SemanticEmbedderProtocol,
)


class RecommendationModelRegistry:
    """Manage shared recommendation model instances within the process."""

    _shared_lock: Lock = Lock()
    _shared_device: Optional[str] = None
    _shared_semantic_embedder: Optional[SemanticEmbedderProtocol] = None
    _shared_feature_extractor: Optional[FeatureExtractorProtocol] = None
    _shared_recommendation_engine: Optional[RecommendationEngineProtocol] = None
    _shared_logger: logging.Logger = logging.getLogger(__name__)

    def __init__(
        self,
        *,
        device: str,
        gpu_enabled: bool = False,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self.device = device
        self.gpu_enabled = gpu_enabled
        self._logger = logger or logging.getLogger(__name__)

    @classmethod
    def _ensure_shared_models_for_device(
        cls,
        device: str,
        gpu_enabled: bool,
        logger: logging.Logger,
    ) -> None:
        with cls._shared_lock:
            if cls._shared_device != device:
                cls._shared_semantic_embedder = None
                cls._shared_feature_extractor = None
                cls._shared_recommendation_engine = None
                cls._shared_device = device

            cls._shared_logger = logger

            if cls._shared_semantic_embedder is None:
                batch_size = 32 if gpu_enabled else 16
                cls._shared_semantic_embedder = LoRASemanticEmbedder(
                    device=device,
                    batch_size=batch_size,
                    logger=logger,
                )

            if cls._shared_feature_extractor is None:
                cls._shared_feature_extractor = GPULoRAFeatureExtractor(
                    device=device,
                    semantic_embedder=cls._shared_semantic_embedder,
                    logger=logger,
                )

            if cls._shared_recommendation_engine is None:
                cls._shared_recommendation_engine = LoRARecommendationEngine(
                    cls._shared_feature_extractor,
                    device=device,
                    logger=logger,
                )

    def _ensure_ready(self) -> None:
        type(self)._ensure_shared_models_for_device(
            self.device,
            self.gpu_enabled,
            self._logger,
        )

    def get_semantic_embedder(self) -> SemanticEmbedderProtocol:
        """Return the shared semantic embedder instance."""
        self._ensure_ready()
        assert type(self)._shared_semantic_embedder is not None
        return type(self)._shared_semantic_embedder

    def get_feature_extractor(self) -> FeatureExtractorProtocol:
        """Return the shared feature extractor instance."""
        self._ensure_ready()
        assert type(self)._shared_feature_extractor is not None
        return type(self)._shared_feature_extractor

    def get_recommendation_engine(self) -> RecommendationEngineProtocol:
        """Return the shared recommendation engine instance."""
        self._ensure_ready()
        assert type(self)._shared_recommendation_engine is not None
        return type(self)._shared_recommendation_engine

    @classmethod
    def preload_models(
        cls,
        *,
        device: str,
        gpu_enabled: bool,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Eagerly load shared models for the provided device."""

        effective_logger = logger or cls._shared_logger
        cls._ensure_shared_models_for_device(device, gpu_enabled, effective_logger)

    @classmethod
    def models_loaded(cls) -> bool:
        """Return whether the shared models have been initialised."""

        return (
            cls._shared_semantic_embedder is not None
            and cls._shared_feature_extractor is not None
            and cls._shared_recommendation_engine is not None
        )
