"""Shared protocol interfaces for recommendation collaborators."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol, Sequence

from backend.schemas.recommendations import (
    IndexRebuildResponse,
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
)

from .model_registry import RecommendationModelRegistry


class RecommendationBootstrap(Protocol):
    """Provide access to shared recommendation model state."""

    gpu_enabled: bool
    device: str

    def get_model_registry(self) -> RecommendationModelRegistry:
        """Return the configured model registry."""

    def set_model_registry(self, registry: RecommendationModelRegistry) -> None:
        """Update the active model registry instance."""


class RecommendationRepository(Protocol):
    """Persistence boundary for recommendation data."""

    def record_feedback(self, feedback: UserFeedbackRequest):  # pragma: no cover - Protocol
        """Persist user feedback about a recommendation."""

    def update_user_preference(self, preference: UserPreferenceRequest):  # pragma: no cover
        """Create or update a stored user preference."""

    def get_adapter(self, adapter_id: str):  # pragma: no cover
        """Return the adapter for ``adapter_id`` if present."""

    def get_active_loras_with_embeddings(
        self,
        *,
        exclude_ids: Optional[Sequence[str]] = None,
    ) -> List[Any]:  # pragma: no cover - Protocol
        """Return active LoRAs with persisted embeddings."""

    def count_active_adapters(self) -> int:  # pragma: no cover - Protocol
        """Return the number of active LoRA adapters."""

    def count_lora_embeddings(self) -> int:  # pragma: no cover - Protocol
        """Return the number of stored embeddings."""

    def count_user_preferences(self) -> int:  # pragma: no cover - Protocol
        """Return the number of stored user preferences."""

    def count_recommendation_sessions(self) -> int:  # pragma: no cover - Protocol
        """Return the total number of recommendation sessions."""

    def count_feedback(self) -> int:  # pragma: no cover - Protocol
        """Return the total number of feedback records."""

    def get_last_embedding_update(self) -> Optional[datetime]:  # pragma: no cover - Protocol
        """Return the most recent embedding update timestamp."""

    def get_embedding(self, adapter_id: str):  # pragma: no cover - Protocol
        """Return the embedding entry for ``adapter_id`` if present."""


class EmbeddingWorkflow(Protocol):
    """Contract for embedding computation orchestration."""

    async def compute_embeddings_for_lora(
        self,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:  # pragma: no cover - Protocol
        """Compute embeddings for a single adapter."""

    async def batch_compute_embeddings(
        self,
        adapter_ids: Optional[Sequence[str]] = None,
        *,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:  # pragma: no cover - Protocol
        """Compute embeddings for a set of adapters."""

    async def ensure_embeddings_exist(self, adapters: Sequence[Any]) -> None:  # pragma: no cover
        """Ensure embeddings exist for ``adapters``."""

    async def build_similarity_index(self) -> None:  # pragma: no cover - Protocol
        """Rebuild the in-memory similarity index."""


class RecommendationPersistenceService(Protocol):
    """Coordinate persistence of recommendation caches."""

    async def rebuild_similarity_index(self, *, force: bool = False) -> IndexRebuildResponse:
        """Rebuild the persisted similarity index."""

    @property
    def index_cache_path(self) -> str:
        """Return the similarity index cache path."""

    @index_cache_path.setter
    def index_cache_path(self, value: str) -> None:
        """Update the similarity index cache path."""

    @property
    def embedding_cache_dir(self) -> str:
        """Return the embedding cache directory."""

    @embedding_cache_dir.setter
    def embedding_cache_dir(self, value: str) -> None:
        """Update the embedding cache directory."""


class RecommendationMetricsTracker(Protocol):
    """Expose aggregated metrics for recommendations."""

    def record_query(self, elapsed_ms: float) -> None:  # pragma: no cover - Protocol
        """Record a completed query duration."""

    def record_cache_hit(self) -> None:  # pragma: no cover - Protocol
        """Record a cache hit."""

    def record_cache_miss(self) -> None:  # pragma: no cover - Protocol
        """Record a cache miss."""

    @property
    def cache_hit_rate(self) -> float:  # pragma: no cover - Protocol
        """Return the ratio of cache hits to requests."""

    @property
    def average_query_time(self) -> float:  # pragma: no cover - Protocol
        """Return the average recommendation query time."""

    def build_stats(
        self,
        repository: RecommendationRepository,
        *,
        gpu_enabled: bool,
    ) -> RecommendationStats:  # pragma: no cover - Protocol
        """Generate a recommendation statistics snapshot."""

