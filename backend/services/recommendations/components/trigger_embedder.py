"""Lightweight embedding helper for trigger phrases."""

from __future__ import annotations

import logging
from typing import Optional, Sequence

import numpy as np

from .sentence_transformer_provider import SentenceTransformerProvider


class TriggerEmbedder:
    """Generate compact embeddings for trigger phrases."""

    MODEL_KEY = "trigger"

    def __init__(
        self,
        *,
        device: str = "cpu",
        logger: Optional[logging.Logger] = None,
        provider: Optional[SentenceTransformerProvider] = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)
        configs = {
            self.MODEL_KEY: {
                "model_name": "sentence-transformers/all-MiniLM-L6-v2",
                "default_dim": 384,
            }
        }
        self._provider = provider or SentenceTransformerProvider(
            device=device,
            logger=self._logger,
            force_fallback=False,
            model_configs=configs,
        )
        self.device = self._provider.device

    @property
    def dimension(self) -> int:
        """Return the embedding dimension for the trigger encoder."""
        return int(self._provider.get_dimension(self.MODEL_KEY))

    def encode(self, phrases: Sequence[str]) -> np.ndarray:
        """Encode ``phrases`` into a 2D numpy array of embeddings."""
        if not phrases:
            return np.zeros((0, self.dimension), dtype=np.float32)
        embeddings = self._provider.encode(self.MODEL_KEY, list(phrases))
        if embeddings.ndim == 1:
            embeddings = embeddings.reshape(1, -1)
        embeddings = np.asarray(embeddings, dtype=np.float32)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return embeddings / norms

    def encode_single(self, phrase: str) -> np.ndarray:
        """Encode a single phrase returning a 1D vector."""
        vectors = self.encode([phrase])
        return (
            vectors[0] if len(vectors) else np.zeros(self.dimension, dtype=np.float32)
        )


__all__ = ["TriggerEmbedder"]
