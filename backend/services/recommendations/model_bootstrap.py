"""Model bootstrap helpers for the recommendation service."""

from __future__ import annotations

import logging
from typing import Optional

from .model_registry import RecommendationModelRegistry


class RecommendationModelBootstrap:
    """Handle GPU detection and model registry initialization."""

    def __init__(
        self,
        *,
        gpu_enabled: Optional[bool] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Initialise the bootstrap helper.

        Args:
            gpu_enabled: Optional override for GPU availability detection.
            logger: Logger used to emit diagnostic messages.

        """
        self._logger = logger or logging.getLogger(__name__)
        self._device, self._gpu_enabled = self._detect_device(gpu_enabled)
        self._model_registry: RecommendationModelRegistry | None = None

    @property
    def device(self) -> str:
        """Return the preferred torch device for the recommendation models."""
        return self._device

    @property
    def gpu_enabled(self) -> bool:
        """Return whether GPU acceleration should be used."""
        return self._gpu_enabled

    def get_model_registry(self) -> RecommendationModelRegistry:
        """Return a lazily created model registry instance."""
        if self._model_registry is None:
            self._model_registry = RecommendationModelRegistry(
                device=self._device,
                gpu_enabled=self._gpu_enabled,
                logger=self._logger,
            )
        return self._model_registry

    def set_model_registry(
        self,
        registry: RecommendationModelRegistry,
    ) -> None:
        """Inject a custom model registry implementation."""
        self._model_registry = registry

    def preload_models(self) -> None:
        """Preload heavy models using the configured device."""
        RecommendationModelRegistry.preload_models(
            device=self._device,
            gpu_enabled=self._gpu_enabled,
        )

    @classmethod
    def preload_models_for_environment(
        cls,
        *,
        gpu_enabled: Optional[bool] = None,
    ) -> None:
        """Preload models for the detected runtime environment."""
        bootstrap = cls(gpu_enabled=gpu_enabled)
        bootstrap.preload_models()

    @classmethod
    def is_gpu_available(cls) -> bool:
        """Detect GPU availability across CUDA, ROCm, and MPS runtimes."""
        try:
            import torch

            if torch.cuda.is_available():
                return True
            if getattr(torch.version, "hip", None):
                return True
            if torch.backends.mps.is_available():
                return True
            return False
        except ImportError:
            return False

    @classmethod
    def _detect_device(cls, gpu_enabled: Optional[bool]) -> tuple[str, bool]:
        if gpu_enabled is None:
            gpu_enabled = cls.is_gpu_available()

        return ("cuda" if gpu_enabled else "cpu", bool(gpu_enabled))

    @classmethod
    def models_loaded(cls) -> bool:
        """Return whether shared models have been loaded for the process."""
        return RecommendationModelRegistry.models_loaded()
