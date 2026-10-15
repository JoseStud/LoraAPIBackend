"""Sentence-transformer encoders with a hashed fallback for missing ML deps."""

from __future__ import annotations

import hashlib
import logging
import re
from threading import Lock
from typing import Any, Dict, List, Mapping, MutableMapping, Optional, Sequence

import numpy as np


class _FallbackSentenceEncoder:
    """Lightweight hashed-feature encoder used when transformers are unavailable."""

    def __init__(self, embedding_dim: int):
        self.embedding_dim = embedding_dim

    def encode(
        self,
        inputs: Any,
        device: str | None = None,
        show_progress_bar: bool = False,
        convert_to_numpy: bool = True,
        **_: Any,
    ) -> np.ndarray | List[float]:
        """Encode text or batch of texts into deterministic hashed vectors."""
        if isinstance(inputs, str):
            vector = self._encode_single(inputs)
            return vector if convert_to_numpy else vector.tolist()

        vectors = [self._encode_single(text) for text in inputs or []]
        if not vectors:
            array = np.zeros((0, self.embedding_dim), dtype=np.float32)
        else:
            array = np.vstack(vectors)
        return array if convert_to_numpy else array.tolist()

    def _encode_single(self, text: Optional[str]) -> np.ndarray:
        if not text:
            return np.zeros(self.embedding_dim, dtype=np.float32)

        tokens = re.findall(r"\b\w+\b", text.lower())
        if not tokens:
            return np.zeros(self.embedding_dim, dtype=np.float32)

        vector = np.zeros(self.embedding_dim, dtype=np.float32)
        for token in tokens:
            digest = hashlib.md5(token.encode("utf-8")).hexdigest()
            index = int(digest, 16) % self.embedding_dim
            vector[index] += 1.0

        norm = np.linalg.norm(vector)
        if norm:
            vector /= norm
        return vector


class SentenceTransformerProvider:
    """Load and serve SentenceTransformer models with transparent fallbacks."""

    def __init__(
        self,
        *,
        device: str = "cuda",
        logger: Optional[logging.Logger] = None,
        force_fallback: bool = False,
        model_configs: Optional[Mapping[str, Mapping[str, Any]]] = None,
    ) -> None:
        """Initialise model configuration and optional fallbacks."""
        self._logger = logger or logging.getLogger(__name__)
        self._preferred_device = device

        self._model_configs: Dict[str, Mapping[str, Any]] = (
            dict(model_configs) if model_configs is not None else {}
        )
        self._models: MutableMapping[str, Any] = {
            key: None for key in self._model_configs
        }
        self._dimensions: Dict[str, int] = {}
        self._load_lock = Lock()

        self._transformers_available = not force_fallback
        self._SentenceTransformer: Any | None = None
        self._torch: Any | None = None

        if self._transformers_available:
            self._import_sentence_transformer()
        else:
            self._logger.warning(
                "sentence-transformers forced off; using fallback hashed embeddings.",
            )

        if not self._transformers_available:
            self.device = "cpu"
        else:
            self._configure_torch_device()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def get_model(self, model_key: str) -> Any:
        """Return the model for the provided key, loading it lazily."""
        self._ensure_model_config(model_key)
        if self._models[model_key] is None:
            # Concurrent first requests (threadpool) must not load it twice.
            with self._load_lock:
                if self._models[model_key] is None:
                    self._models[model_key] = self._load_model(model_key)
        return self._models[model_key]

    def get_dimension(self, model_key: str) -> int:
        """Return the embedding dimension for the specified model."""
        self._ensure_model_config(model_key)
        if model_key not in self._dimensions:
            model = self.get_model(model_key)
            default_dim = int(self._model_configs[model_key]["default_dim"])
            self._dimensions[model_key] = self._resolve_dimension(model, default_dim)
        return self._dimensions[model_key]

    def encode(
        self,
        model_key: str,
        inputs: Any,
        *,
        batch_size: Optional[int] = None,
        show_progress_bar: bool = False,
    ) -> np.ndarray:
        """Encode the provided input(s) using the requested model."""
        model = self.get_model(model_key)
        encode_kwargs: Dict[str, Any] = {
            "show_progress_bar": show_progress_bar,
            "convert_to_numpy": True,
        }

        if self._transformers_available:
            encode_kwargs["device"] = self.device
            if batch_size is not None and not isinstance(inputs, str):
                encode_kwargs["batch_size"] = batch_size

        if self._transformers_available and self._torch is not None:
            with self._torch.no_grad():
                return model.encode(inputs, **encode_kwargs)

        return model.encode(inputs, **encode_kwargs)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _ensure_model_config(self, model_key: str) -> None:
        if model_key not in self._model_configs:
            raise KeyError(f"Unknown model key: {model_key}")

    def _import_sentence_transformer(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer

            self._SentenceTransformer = SentenceTransformer
        except ImportError:
            self._transformers_available = False
            self._logger.warning(
                "sentence-transformers not available; using fallback hashed "
                "embeddings.",
            )

    def _configure_torch_device(self) -> None:
        self.device = self._preferred_device
        try:
            import torch

            self._torch = torch
        except ImportError:
            self._logger.warning("PyTorch not available, falling back to CPU")
            self.device = "cpu"
            self._torch = None
            return

        if self.device in {"cuda", "gpu"}:
            # ``torch.cuda`` also reports ROCm (HIP) devices. A ROCm build of
            # torch without a usable GPU must fall back instead of using cuda.
            if torch.cuda.is_available():
                self._logger.info(
                    "Using CUDA/ROCm GPU acceleration with %s",
                    torch.cuda.get_device_name(),
                )
                self.device = "cuda"
            elif torch.backends.mps.is_available():
                self._logger.info("Using Apple Silicon GPU acceleration")
                self.device = "mps"
            else:
                self._logger.warning("GPU not available, falling back to CPU")
                self.device = "cpu"
        elif self.device == "mps" and not torch.backends.mps.is_available():
            self._logger.warning("Apple Silicon GPU not available, falling back to CPU")
            self.device = "cpu"
        elif self.device not in {"cuda", "mps"}:
            self.device = "cpu"

    def _load_model(self, model_key: str) -> Any:
        config = self._model_configs[model_key]
        default_dim = int(config["default_dim"])

        if not self._transformers_available or self._SentenceTransformer is None:
            self._dimensions[model_key] = default_dim
            return _FallbackSentenceEncoder(default_dim)

        model_name = config.get("model_name")
        if not model_name:
            raise ValueError(f"Missing model_name for {model_key}")

        self._logger.info("Loading SentenceTransformer model %s", model_name)
        model = self._SentenceTransformer(model_name)
        if self.device in {"cuda", "mps"}:
            model = model.to(self.device)

        self._dimensions[model_key] = self._resolve_dimension(model, default_dim)
        return model

    def _resolve_dimension(self, model: Any, default_dim: int) -> int:
        getter = getattr(model, "get_sentence_embedding_dimension", None)
        if callable(getter):
            try:
                dim = getter()
                if dim:
                    return int(dim)
            except Exception:
                pass

        embedding_dim = getattr(model, "embedding_dim", None)
        if embedding_dim:
            try:
                return int(embedding_dim)
            except Exception:
                pass

        try:
            sample = model.encode("", convert_to_numpy=True)
            if hasattr(sample, "shape") and sample.shape[-1]:
                return int(sample.shape[-1])
            if isinstance(sample, (list, tuple)):
                return int(len(sample))
        except Exception:
            pass

        return default_dim


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
        """Initialise the embedder with the desired device and provider overrides."""
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
