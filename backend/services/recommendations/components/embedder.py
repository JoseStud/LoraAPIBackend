"""Semantic embedding components for the recommendation system."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Sequence

import numpy as np

from .interfaces import SemanticEmbedderProtocol
from .sentence_transformer_provider import SentenceTransformerProvider
from .text_payload_builder import MultiModalTextPayloadBuilder


class LoRASemanticEmbedder(SemanticEmbedderProtocol):
    """Generate high-quality dense vector representations using 8GB VRAM."""

    SEMANTIC_DIM = 1024
    ARTISTIC_DIM = 384
    TECHNICAL_DIM = 768

    _MODEL_CONFIGS: Dict[str, Dict[str, Any]] = {
        "semantic": {
            "model_name": "sentence-transformers/all-mpnet-base-v2",
            "default_dim": SEMANTIC_DIM,
        },
        "artistic": {
            "model_name": "sentence-transformers/all-MiniLM-L12-v2",
            "default_dim": ARTISTIC_DIM,
        },
        "technical": {
            "model_name": "sentence-transformers/paraphrase-mpnet-base-v2",
            "default_dim": TECHNICAL_DIM,
        },
    }

    def __init__(
        self,
        device: str = "cuda",
        batch_size: int = 32,
        mixed_precision: bool = True,
        *,
        logger: Optional[logging.Logger] = None,
        force_fallback: bool = False,
        provider: SentenceTransformerProvider | None = None,
        payload_builder: MultiModalTextPayloadBuilder | None = None,
    ) -> None:
        """Initialize semantic embedding orchestrator."""
        self.batch_size = batch_size
        self.mixed_precision = mixed_precision
        self._logger = logger or logging.getLogger(__name__)
        self._payload_builder = payload_builder or MultiModalTextPayloadBuilder()

        if provider is None:
            provider = SentenceTransformerProvider(
                device=device,
                logger=self._logger,
                force_fallback=force_fallback,
                model_configs=self._MODEL_CONFIGS,
            )
        self._provider = provider
        self.device = self._provider.device

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------
    @property
    def primary_model(self) -> Any:
        """Get the primary embedding model, loading if necessary."""
        return self._provider.get_model("semantic")

    @property
    def art_model(self) -> Any:
        """Get the artistic embedding model, loading if necessary."""
        return self._provider.get_model("artistic")

    @property
    def technical_model(self) -> Any:
        """Get the technical embedding model, loading if necessary."""
        return self._provider.get_model("technical")

    # ------------------------------------------------------------------
    # Embedding helpers
    # ------------------------------------------------------------------
    def _get_semantic_dim(self) -> int:
        return self._provider.get_dimension("semantic")

    def _get_artistic_dim(self) -> int:
        return self._provider.get_dimension("artistic")

    def _get_technical_dim(self) -> int:
        return self._provider.get_dimension("technical")

    def _encode_single(
        self, model_key: str, text: str, *, device: Optional[str] = None
    ) -> np.ndarray:
        if text.strip():
            restore_device = False
            original_device: Optional[str] = None
            if device is not None and device != self._provider.device:
                original_device = self._provider.device
                self._provider.device = device
                restore_device = True
            try:
                embedding = self._provider.encode(
                    model_key,
                    text,
                    show_progress_bar=False,
                )
            finally:
                if restore_device and original_device is not None:
                    self._provider.device = original_device
            return np.asarray(embedding, dtype=np.float32)

        dim_lookup = {
            "semantic": self._get_semantic_dim,
            "artistic": self._get_artistic_dim,
            "technical": self._get_technical_dim,
        }
        dim = dim_lookup[model_key]()
        return np.zeros(dim, dtype=np.float32)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def create_multi_modal_embedding(self, lora: Any) -> Dict[str, np.ndarray]:
        """Generate multiple specialized embeddings for different aspects."""
        content_texts = self._payload_builder.build_payload(lora)

        embeddings: Dict[str, np.ndarray] = {
            "semantic": self._encode_single("semantic", content_texts["semantic"]),
            "artistic": self._encode_single("artistic", content_texts["artistic"]),
            "technical": self._encode_single("technical", content_texts["technical"]),
        }

        return embeddings

    def batch_encode_collection(self, loras: Sequence[Any]) -> Dict[str, np.ndarray]:
        """Efficiently batch process entire LoRA collection using GPU."""
        if not loras:
            return {
                "semantic": np.zeros((0, self._get_semantic_dim()), dtype=np.float32),
                "artistic": np.zeros((0, self._get_artistic_dim()), dtype=np.float32),
                "technical": np.zeros((0, self._get_technical_dim()), dtype=np.float32),
            }

        all_semantic = []
        all_artistic = []
        all_technical = []

        for lora in loras:
            texts = self._payload_builder.build_payload(lora)
            all_semantic.append(texts["semantic"])
            all_artistic.append(texts["artistic"])
            all_technical.append(texts["technical"])

        self._logger.info("Batch encoding %s LoRAs", len(loras))

        semantic_embeddings = self._provider.encode(
            "semantic",
            all_semantic,
            batch_size=self.batch_size,
            show_progress_bar=True,
        )

        artistic_embeddings = self._provider.encode(
            "artistic",
            all_artistic,
            batch_size=self.batch_size,
            show_progress_bar=True,
        )

        technical_embeddings = self._provider.encode(
            "technical",
            all_technical,
            batch_size=self.batch_size,
            show_progress_bar=True,
        )

        return {
            "semantic": np.asarray(semantic_embeddings, dtype=np.float32),
            "artistic": np.asarray(artistic_embeddings, dtype=np.float32),
            "technical": np.asarray(technical_embeddings, dtype=np.float32),
        }

    def compute_prompt_embeddings(
        self, prompt: str, *, device: Optional[str] = None
    ) -> Dict[str, np.ndarray]:
        """Compute semantic, artistic, and technical embeddings for ``prompt``."""
        return {
            "semantic": self._encode_single("semantic", prompt, device=device),
            "artistic": self._encode_single("artistic", prompt, device=device),
            "technical": self._encode_single("technical", prompt, device=device),
        }


__all__ = ["LoRASemanticEmbedder"]
