"""Semantic embedding components for the recommendation system."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from .interfaces import SemanticEmbedderProtocol


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


class LoRASemanticEmbedder(SemanticEmbedderProtocol):
    """Generate high-quality dense vector representations using 8GB VRAM."""

    SEMANTIC_DIM = 1024
    ARTISTIC_DIM = 384
    TECHNICAL_DIM = 768

    def __init__(
        self,
        device: str = "cuda",
        batch_size: int = 32,
        mixed_precision: bool = True,
        *,
        logger: Optional[logging.Logger] = None,
        force_fallback: bool = False,
    ) -> None:
        """Initialize semantic embedding models."""

        self.device = device
        self.batch_size = batch_size
        self.mixed_precision = mixed_precision
        self._logger = logger or logging.getLogger(__name__)

        self._transformers_available = not force_fallback
        self.SentenceTransformer: Any | None = None

        if not force_fallback:
            try:
                from sentence_transformers import SentenceTransformer

                self.SentenceTransformer = SentenceTransformer
            except ImportError:
                self._transformers_available = False
                self._logger.warning(
                    "sentence-transformers not available; using fallback hashed embeddings.",
                )

        if not self._transformers_available:
            self.SentenceTransformer = None

        # Check GPU availability (supports both CUDA and ROCm)
        if self._transformers_available and device in ["cuda", "gpu"]:
            try:
                import torch

                if torch.cuda.is_available():
                    self._logger.info(
                        "Using CUDA GPU acceleration with %s",
                        torch.cuda.get_device_name(),
                    )
                    self.device = "cuda"
                elif getattr(torch.version, "hip", None) is not None:
                    # ROCm/HIP support for AMD GPUs
                    self._logger.info("Using AMD ROCm GPU acceleration")
                    self.device = "cuda"  # PyTorch uses 'cuda' for ROCm too
                elif torch.backends.mps.is_available():
                    # Apple Silicon GPU support
                    self._logger.info("Using Apple Silicon GPU acceleration")
                    self.device = "mps"
                else:
                    self._logger.warning("GPU not available, falling back to CPU")
                    self.device = "cpu"
            except ImportError:
                self._logger.warning("PyTorch not available, falling back to CPU")
                self.device = "cpu"

        # Initialize models lazily
        self._primary_model: Any | None = None
        self._art_model: Any | None = None
        self._technical_model: Any | None = None

        # Cache dynamically discovered embedding dimensions so fallback
        # vectors match the actual encoder output size.
        self._semantic_dim: Optional[int] = None
        self._artistic_dim: Optional[int] = None
        self._technical_dim: Optional[int] = None

    def _load_models(self) -> None:
        """Load all embedding models."""
        if self._primary_model is not None:
            return

        if not self._transformers_available:
            self._primary_model = _FallbackSentenceEncoder(self.SEMANTIC_DIM)
            self._art_model = _FallbackSentenceEncoder(self.ARTISTIC_DIM)
            self._technical_model = _FallbackSentenceEncoder(self.TECHNICAL_DIM)
            return

        if self.SentenceTransformer is None:
            raise RuntimeError("SentenceTransformer class not available")

        self._logger.info("Loading semantic embedding models")

        # Primary embedding model - excellent for semantic similarity
        # VRAM Usage: ~2-3GB, 1024-dim embeddings, superior quality
        self._primary_model = self.SentenceTransformer(
            "sentence-transformers/all-mpnet-base-v2",
        )
        if self.device == "cuda":
            self._primary_model = self._primary_model.to(self.device)

        # Specialized art/anime model for domain-specific understanding
        # VRAM Usage: ~1-2GB, 768-dim embeddings
        self._art_model = self.SentenceTransformer(
            "sentence-transformers/all-MiniLM-L12-v2",
        )
        if self.device == "cuda":
            self._art_model = self._art_model.to(self.device)

        # Technical prompt analysis model for parameter understanding
        # VRAM Usage: ~1GB, optimized for technical content
        self._technical_model = self.SentenceTransformer(
            "sentence-transformers/paraphrase-mpnet-base-v2",
        )
        if self.device == "cuda":
            self._technical_model = self._technical_model.to(self.device)

        self._logger.info("Semantic embedding models loaded successfully")

    def _resolve_dimension(self, model: Any, default_dim: int) -> int:
        """Infer the embedding dimensionality for the provided model."""
        if model is None:
            return default_dim

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

    def _get_semantic_dim(self) -> int:
        if self._semantic_dim is None:
            self._semantic_dim = self._resolve_dimension(
                self.primary_model,
                self.SEMANTIC_DIM,
            )
        return self._semantic_dim

    def _get_artistic_dim(self) -> int:
        if self._artistic_dim is None:
            self._artistic_dim = self._resolve_dimension(
                self.art_model,
                self.ARTISTIC_DIM,
            )
        return self._artistic_dim

    def _get_technical_dim(self) -> int:
        if self._technical_dim is None:
            self._technical_dim = self._resolve_dimension(
                self.technical_model,
                self.TECHNICAL_DIM,
            )
        return self._technical_dim

    @property
    def primary_model(self) -> Any:
        """Get primary model, loading if necessary."""
        if self._primary_model is None:
            self._load_models()
        return self._primary_model

    @property
    def art_model(self) -> Any:
        """Get art model, loading if necessary."""
        if self._art_model is None:
            self._load_models()
        return self._art_model

    @property
    def technical_model(self) -> Any:
        """Get technical model, loading if necessary."""
        if self._technical_model is None:
            self._load_models()
        return self._technical_model

    def create_multi_modal_embedding(self, lora: Any) -> Dict[str, np.ndarray]:
        """Generate multiple specialized embeddings for different aspects."""
        content_texts = self._prepare_multi_modal_text(lora)

        embeddings: Dict[str, np.ndarray] = {}

        semantic_text = content_texts["semantic"]
        if semantic_text.strip():
            embeddings["semantic"] = self.primary_model.encode(
                semantic_text,
                device=self.device,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
        else:
            embeddings["semantic"] = np.zeros(
                self._get_semantic_dim(),
                dtype=np.float32,
            )

        art_text = content_texts["artistic"]
        if art_text.strip():
            embeddings["artistic"] = self.art_model.encode(
                art_text,
                device=self.device,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
        else:
            embeddings["artistic"] = np.zeros(
                self._get_artistic_dim(),
                dtype=np.float32,
            )

        tech_text = content_texts["technical"]
        if tech_text.strip():
            embeddings["technical"] = self.technical_model.encode(
                tech_text,
                device=self.device,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
        else:
            embeddings["technical"] = np.zeros(
                self._get_technical_dim(),
                dtype=np.float32,
            )

        return embeddings

    def _prepare_multi_modal_text(self, lora: Any) -> Dict[str, str]:
        """Prepare specialized text representations for different embedding types."""
        semantic_components: List[str] = []
        if getattr(lora, "description", None):
            semantic_components.append(f"Description: {lora.description}")
        if getattr(lora, "trained_words", None):
            semantic_components.append(
                f"Trained on: {', '.join(lora.trained_words)}",
            )
        if getattr(lora, "triggers", None):
            semantic_components.append(f"Triggers: {', '.join(lora.triggers)}")
        if getattr(lora, "activation_text", None):
            semantic_components.append(f"Activation: {lora.activation_text}")

        artistic_components: List[str] = []
        if getattr(lora, "description", None):
            artistic_terms = self._extract_artistic_terms(lora.description)
            if artistic_terms:
                artistic_components.append(artistic_terms)
        if getattr(lora, "tags", None):
            art_tags = [
                tag for tag in lora.tags if self._is_artistic_tag(tag)
            ]
            if art_tags:
                artistic_components.append(f"Art style: {', '.join(art_tags)}")
        if getattr(lora, "archetype", None):
            artistic_components.append(f"Character type: {lora.archetype}")

        technical_components: List[str] = []
        if getattr(lora, "sd_version", None):
            technical_components.append(f"SD Version: {lora.sd_version}")
        if getattr(lora, "supports_generation", None):
            technical_components.append("Supports generation")
        nsfw_level = getattr(lora, "nsfw_level", None)
        if nsfw_level is not None:
            safety_level = (
                "Safe" if nsfw_level == 0 else f"NSFW Level {nsfw_level}"
            )
            technical_components.append(f"Safety: {safety_level}")
        size_kb = getattr(lora, "primary_file_size_kb", None)
        if size_kb:
            size_category = self._categorize_file_size(size_kb)
            technical_components.append(f"Model size: {size_category}")

        return {
            "semantic": " | ".join(semantic_components)
            if semantic_components
            else "",
            "artistic": " | ".join(artistic_components)
            if artistic_components
            else "",
            "technical": " | ".join(technical_components)
            if technical_components
            else "",
        }

    def _extract_artistic_terms(self, description: str) -> str:
        """Extract artistic and style-related terms from description."""
        if not description:
            return ""

        art_keywords = [
            "anime",
            "realistic",
            "cartoon",
            "abstract",
            "photographic",
            "digital art",
            "painting",
            "sketch",
            "3d render",
            "pixel art",
            "watercolor",
            "oil painting",
            "concept art",
            "illustration",
            "manga",
            "comic",
            "fantasy",
            "sci-fi",
            "portrait",
            "landscape",
        ]

        found_terms: List[str] = []
        desc_lower = description.lower()
        for keyword in art_keywords:
            if keyword in desc_lower:
                found_terms.append(keyword)

        return ", ".join(found_terms[:5])

    def _is_artistic_tag(self, tag: str) -> bool:
        """Check if a tag is art/style related."""
        art_related = [
            "style",
            "art",
            "anime",
            "realistic",
            "character",
            "portrait",
            "landscape",
            "fantasy",
            "sci-fi",
            "concept",
            "illustration",
            "digital",
            "painting",
            "drawing",
            "sketch",
            "3d",
            "render",
        ]

        tag_lower = tag.lower()
        return any(art_term in tag_lower for art_term in art_related)

    def _categorize_file_size(self, size_kb: int) -> str:
        """Categorize file size for technical understanding."""
        size_mb = size_kb / 1024

        if size_mb < 50:
            return "Small"
        if size_mb < 200:
            return "Medium"
        if size_mb < 500:
            return "Large"
        return "Very Large"

    def batch_encode_collection(self, loras: Sequence[Any]) -> Dict[str, np.ndarray]:
        """Efficiently batch process entire LoRA collection using GPU."""
        all_semantic: List[str] = []
        all_artistic: List[str] = []
        all_technical: List[str] = []

        for lora in loras:
            texts = self._prepare_multi_modal_text(lora)
            all_semantic.append(texts["semantic"])
            all_artistic.append(texts["artistic"])
            all_technical.append(texts["technical"])

        self._logger.info("Batch encoding %s LoRAs", len(loras))

        if self._transformers_available:
            context_manager = None
            try:
                import torch

                context_manager = torch.no_grad()
            except Exception:
                context_manager = None

            if context_manager:
                with context_manager:
                    semantic_embeddings = self.primary_model.encode(
                        all_semantic,
                        batch_size=self.batch_size,
                        device=self.device,
                        show_progress_bar=True,
                        convert_to_numpy=True,
                    )

                    artistic_embeddings = self.art_model.encode(
                        all_artistic,
                        batch_size=self.batch_size,
                        device=self.device,
                        show_progress_bar=True,
                        convert_to_numpy=True,
                    )

                    technical_embeddings = self.technical_model.encode(
                        all_technical,
                        batch_size=self.batch_size,
                        device=self.device,
                        show_progress_bar=True,
                        convert_to_numpy=True,
                    )
            else:
                semantic_embeddings = self.primary_model.encode(
                    all_semantic,
                    batch_size=self.batch_size,
                    show_progress_bar=True,
                    convert_to_numpy=True,
                )

                artistic_embeddings = self.art_model.encode(
                    all_artistic,
                    batch_size=self.batch_size,
                    show_progress_bar=True,
                    convert_to_numpy=True,
                )

                technical_embeddings = self.technical_model.encode(
                    all_technical,
                    batch_size=self.batch_size,
                    show_progress_bar=True,
                    convert_to_numpy=True,
                )
        else:
            semantic_embeddings = self.primary_model.encode(
                all_semantic,
                convert_to_numpy=True,
            )

            artistic_embeddings = self.art_model.encode(
                all_artistic,
                convert_to_numpy=True,
            )

            technical_embeddings = self.technical_model.encode(
                all_technical,
                convert_to_numpy=True,
            )

        return {
            "semantic": np.asarray(semantic_embeddings, dtype=np.float32),
            "artistic": np.asarray(artistic_embeddings, dtype=np.float32),
            "technical": np.asarray(technical_embeddings, dtype=np.float32),
        }
