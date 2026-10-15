"""Multi-modal LoRA embeddings and per-adapter feature extraction."""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence

import numpy as np

from .encoders import SentenceTransformerProvider, TriggerEmbedder
from .scoring import ScoreCalculator
from .triggers import TriggerResolver


class MultiModalTextPayloadBuilder:
    """Create semantic, artistic, and technical text payloads for LoRAs."""

    _ART_TAG_KEYWORDS: tuple[str, ...] = (
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
    )

    def build_payload(self, lora: Any) -> Dict[str, str]:
        """Create multi-modal text payloads from a LoRA object."""
        return {
            "semantic": self._build_semantic_payload(lora),
            "artistic": self._build_artistic_payload(lora),
            "technical": self._build_technical_payload(lora),
        }

    def _build_semantic_payload(self, lora: Any) -> str:
        components: List[str] = []

        trained_words: Iterable[str] | None = getattr(lora, "trained_words", None)
        if trained_words:
            components.append(f"Trained on: {', '.join(trained_words)}")

        triggers: Iterable[str] | None = getattr(lora, "triggers", None)
        if triggers:
            components.append(f"Triggers: {', '.join(triggers)}")

        activation_text = getattr(lora, "activation_text", None)
        if activation_text:
            components.append(f"Activation: {activation_text}")

        return " | ".join(components)

    def _build_artistic_payload(self, lora: Any) -> str:
        components: List[str] = []

        tags: Iterable[str] | None = getattr(lora, "tags", None)
        if tags:
            artistic_tags = [tag for tag in tags if self._is_artistic_tag(tag)]
            if artistic_tags:
                components.append(f"Art style: {', '.join(artistic_tags)}")

        archetype = getattr(lora, "archetype", None)
        if archetype:
            components.append(f"Character type: {archetype}")

        return " | ".join(components)

    def _is_artistic_tag(self, tag: str) -> bool:
        """Check if a tag is art/style related."""
        tag_lower = tag.lower()
        return any(keyword in tag_lower for keyword in self._ART_TAG_KEYWORDS)

    def _build_technical_payload(self, lora: Any) -> str:
        components: List[str] = []

        sd_version = getattr(lora, "sd_version", None)
        if sd_version:
            components.append(f"SD Version: {sd_version}")

        if getattr(lora, "supports_generation", None):
            components.append("Supports generation")

        nsfw_level = getattr(lora, "nsfw_level", None)
        if nsfw_level is not None:
            safety_level = "Safe" if nsfw_level == 0 else f"NSFW Level {nsfw_level}"
            components.append(f"Safety: {safety_level}")

        size_kb = getattr(lora, "primary_file_size_kb", None)
        if size_kb:
            components.append(f"Model size: {self._categorize_file_size(size_kb)}")

        return " | ".join(components)

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


class LoRASemanticEmbedder:
    """Encode LoRAs and prompts into semantic, artistic and technical vectors."""

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

    def _encode_single(
        self, model_key: str, text: str, *, device: Optional[str] = None
    ) -> np.ndarray:
        if not text.strip():
            dim = self._provider.get_dimension(model_key)
            return np.zeros(dim, dtype=np.float32)

        original_device = self._provider.device
        if device is not None:
            self._provider.device = device
        try:
            embedding = self._provider.encode(
                model_key,
                text,
                show_progress_bar=False,
            )
        finally:
            self._provider.device = original_device
        return np.asarray(embedding, dtype=np.float32)

    def create_multi_modal_embedding(self, lora: Any) -> Dict[str, np.ndarray]:
        """Generate multiple specialized embeddings for different aspects."""
        content_texts = self._payload_builder.build_payload(lora)
        return {
            key: self._encode_single(key, content_texts[key])
            for key in ("semantic", "artistic", "technical")
        }

    def batch_encode_collection(self, loras: Sequence[Any]) -> Dict[str, np.ndarray]:
        """Efficiently batch process entire LoRA collection using GPU."""
        keys = ("semantic", "artistic", "technical")
        if not loras:
            return {
                key: np.zeros((0, self._provider.get_dimension(key)), dtype=np.float32)
                for key in keys
            }

        payloads = [self._payload_builder.build_payload(lora) for lora in loras]
        self._logger.info("Batch encoding %s LoRAs", len(loras))

        return {
            key: np.asarray(
                self._provider.encode(
                    key,
                    [payload[key] for payload in payloads],
                    batch_size=self.batch_size,
                    show_progress_bar=True,
                ),
                dtype=np.float32,
            )
            for key in keys
        }

    def compute_prompt_embeddings(
        self, prompt: str, *, device: Optional[str] = None
    ) -> Dict[str, np.ndarray]:
        """Compute semantic, artistic, and technical embeddings for ``prompt``."""
        return {
            key: self._encode_single(key, prompt, device=device)
            for key in ("semantic", "artistic", "technical")
        }


class GPULoRAFeatureExtractor:
    """Extract the embeddings, scores and trigger data stored per adapter."""

    def __init__(
        self,
        *,
        device: str = "cuda",
        semantic_embedder: LoRASemanticEmbedder | None = None,
        score_calculator: ScoreCalculator | None = None,
        trigger_resolver: TriggerResolver | None = None,
        trigger_embedder: TriggerEmbedder | None = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """Initialize feature extractor."""
        self.device = device
        self._logger = logger or logging.getLogger(__name__)
        self.semantic_embedder = semantic_embedder or LoRASemanticEmbedder(
            device=device,
            logger=self._logger,
        )
        self.score_calculator = score_calculator or ScoreCalculator(
            logger=self._logger,
        )
        self.trigger_resolver = trigger_resolver or TriggerResolver()
        self.trigger_embedder = trigger_embedder or TriggerEmbedder(
            device="cpu", logger=self._logger
        )

    def extract_advanced_features(self, lora: Any) -> Dict[str, Any]:
        """Extract comprehensive features using available models."""
        features: Dict[str, Any] = {}

        embeddings = self.semantic_embedder.create_multi_modal_embedding(lora)
        features.update(
            {
                "semantic_embedding": embeddings["semantic"],
                "artistic_embedding": embeddings["artistic"],
                "technical_embedding": embeddings["technical"],
            },
        )

        features.update(self.score_calculator.compute(lora))

        trigger_candidates = self.trigger_resolver.build_candidates_from_adapter(
            getattr(lora, "triggers", []) or [],
            getattr(lora, "trained_words", []) or [],
            getattr(lora, "activation_text", None),
        )
        trigger_resolution = self.trigger_resolver.resolve(trigger_candidates)
        if trigger_resolution.canonical:
            trigger_vectors = self.trigger_embedder.encode(trigger_resolution.canonical)
            features.update({
                "normalized_triggers": trigger_resolution.canonical,
                "trigger_aliases": trigger_resolution.alias_map,
                "trigger_metadata": {
                    "confidence": trigger_resolution.confidence,
                    "sources": trigger_resolution.sources,
                },
                "trigger_embeddings": [
                    vector.astype(float).tolist() for vector in trigger_vectors
                ],
            })

        return features
