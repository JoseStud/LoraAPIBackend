"""Protocol definitions for recommendation components."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol, Sequence, runtime_checkable

import numpy as np


@runtime_checkable
class SemanticEmbedderProtocol(Protocol):
    """Interface for semantic embedding providers."""

    @property
    def primary_model(self) -> Any:
        """Return the primary encoding model."""

    def create_multi_modal_embedding(self, lora: Any) -> Dict[str, np.ndarray]:
        """Create semantic, artistic, and technical embeddings for a LoRA."""

    def batch_encode_collection(self, loras: Sequence[Any]) -> Dict[str, np.ndarray]:
        """Batch encode a collection of LoRAs."""


@runtime_checkable
class FeatureExtractorProtocol(Protocol):
    """Interface for LoRA feature extractors."""

    semantic_embedder: SemanticEmbedderProtocol

    def extract_advanced_features(self, lora: Any) -> Dict[str, Any]:
        """Extract embedding vectors and metadata for a LoRA."""


@runtime_checkable
class RecommendationEngineProtocol(Protocol):
    """Interface for recommendation engines."""

    def build_similarity_index(self, loras: Sequence[Any]) -> None:
        """Build an index from the provided LoRAs."""

    def get_recommendations(
        self,
        target_lora: Any,
        n_recommendations: int = 20,
        weights: Optional[Dict[str, float]] = None,
        diversify_results: bool = True,
    ) -> List[Dict[str, Any]]:
        """Return ranked recommendations for the target LoRA."""

    def update_index_incremental(self, new_loras: Sequence[Any]) -> None:
        """Incrementally update the index with new LoRAs."""
