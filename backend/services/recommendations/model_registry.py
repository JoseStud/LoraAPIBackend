"""Shared model registry for recommendation workflows."""

from threading import Lock
from typing import Optional


class RecommendationModelRegistry:
    """Manage shared recommendation model instances within the process."""

    _shared_lock: Lock = Lock()
    _shared_device: Optional[str] = None
    _shared_semantic_embedder = None
    _shared_feature_extractor = None
    _shared_recommendation_engine = None

    def __init__(self, *, device: str, gpu_enabled: bool = False):
        self.device = device
        self.gpu_enabled = gpu_enabled

    @classmethod
    def _ensure_shared_models_for_device(cls, device: str, gpu_enabled: bool) -> None:
        with cls._shared_lock:
            if cls._shared_device != device:
                cls._shared_semantic_embedder = None
                cls._shared_feature_extractor = None
                cls._shared_recommendation_engine = None
                cls._shared_device = device

            if cls._shared_semantic_embedder is None:
                from ..recommendation_models import LoRASemanticEmbedder

                batch_size = 32 if gpu_enabled else 16
                cls._shared_semantic_embedder = LoRASemanticEmbedder(
                    device=device,
                    batch_size=batch_size,
                )

            if cls._shared_feature_extractor is None:
                from ..recommendation_models import GPULoRAFeatureExtractor

                cls._shared_feature_extractor = GPULoRAFeatureExtractor(device=device)

            if cls._shared_recommendation_engine is None:
                from ..recommendation_models import LoRARecommendationEngine

                cls._shared_recommendation_engine = LoRARecommendationEngine(
                    cls._shared_feature_extractor,
                    device=device,
                )

    def _ensure_ready(self) -> None:
        type(self)._ensure_shared_models_for_device(self.device, self.gpu_enabled)

    def get_semantic_embedder(self):
        """Return the shared semantic embedder instance."""
        self._ensure_ready()
        return type(self)._shared_semantic_embedder

    def get_feature_extractor(self):
        """Return the shared feature extractor instance."""
        self._ensure_ready()
        return type(self)._shared_feature_extractor

    def get_recommendation_engine(self):
        """Return the shared recommendation engine instance."""
        self._ensure_ready()
        return type(self)._shared_recommendation_engine

    @classmethod
    def preload_models(cls, *, device: str, gpu_enabled: bool) -> None:
        """Eagerly load shared models for the provided device."""
        cls._ensure_shared_models_for_device(device, gpu_enabled)
