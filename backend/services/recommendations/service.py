"""Recommendation service for LoRA adapter discovery and learning."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlmodel import Session

from backend.models import (
    LoRAEmbedding,
    RecommendationFeedback,
    UserPreference,
)
from backend.schemas.recommendations import (
    EmbeddingStatus,
    IndexRebuildResponse,
    RecommendationItem,
    RecommendationStats,
    UserFeedbackRequest,
    UserPreferenceRequest,
)

from .components.interfaces import (
    FeatureExtractorProtocol,
    RecommendationEngineProtocol,
    SemanticEmbedderProtocol,
)
from .embedding_manager import EmbeddingManager
from .metrics import RecommendationMetrics
from .model_bootstrap import RecommendationModelBootstrap
from .model_registry import RecommendationModelRegistry
from .persistence_manager import RecommendationPersistenceManager
from .repository import RecommendationRepository
from .strategies import (
    get_recommendations_for_prompt as prompt_strategy,
    get_similar_loras as similar_loras_strategy,
)


class RecommendationService:
    """Service for generating intelligent LoRA recommendations."""

    def __init__(
        self,
        db_session: Optional[Session],
        gpu_enabled: bool = False,
        *,
        logger: Optional[logging.Logger] = None,
        model_bootstrap: Optional[RecommendationModelBootstrap] = None,
        model_registry: Optional[RecommendationModelRegistry] = None,
        embedding_manager: Optional[EmbeddingManager] = None,
        repository: Optional[RecommendationRepository] = None,
        persistence_manager: Optional[RecommendationPersistenceManager] = None,
    ):
        """Initialize recommendation service.
        
        Args:
            db_session: Database session
            gpu_enabled: Whether to use GPU acceleration (requires CUDA setup)

        """
        self.db_session = db_session
        self._logger = logger or logging.getLogger(__name__)

        self._model_bootstrap = model_bootstrap or RecommendationModelBootstrap(
            gpu_enabled=gpu_enabled,
            logger=self._logger,
        )

        if model_registry is not None:
            self._model_bootstrap.set_model_registry(model_registry)

        self._model_registry = self._model_bootstrap.get_model_registry()
        self.gpu_enabled = self._model_bootstrap.gpu_enabled
        self.device = self._model_bootstrap.device

        self._embedding_manager = embedding_manager
        self._repository = repository
        self._persistence_manager = persistence_manager
        self._metrics = RecommendationMetrics()

    @staticmethod
    def is_gpu_available() -> bool:
        """Detect GPU availability across CUDA, ROCm, and MPS runtimes."""

        return RecommendationModelBootstrap.is_gpu_available()

    def _get_model_registry(self) -> RecommendationModelRegistry:
        return self._model_registry

    def _get_embedding_manager(self) -> EmbeddingManager:
        if self._embedding_manager is None:
            session = self._require_db_session()
            self._embedding_manager = EmbeddingManager(
                session,
                self._model_registry,
                feature_extractor_getter=self._get_feature_extractor,
                recommendation_engine_getter=self._get_recommendation_engine,
                single_embedding_compute=self.compute_embeddings_for_lora,
            )
        return self._embedding_manager

    def _get_repository(self) -> RecommendationRepository:
        if self._repository is None:
            session = self._require_db_session()
            self._repository = RecommendationRepository(session)
        return self._repository

    def _get_persistence_manager(self) -> RecommendationPersistenceManager:
        if self._persistence_manager is None:
            self._persistence_manager = RecommendationPersistenceManager(
                self._get_embedding_manager(),
                self._get_recommendation_engine,
            )
        return self._persistence_manager

    def _get_semantic_embedder(self) -> SemanticEmbedderProtocol:
        return self._model_registry.get_semantic_embedder()

    def _require_db_session(self) -> Session:
        """Return the active database session or raise if unavailable."""
        if self.db_session is None:
            raise RuntimeError("RecommendationService requires an active database session")
        return self.db_session

    def _get_feature_extractor(self) -> FeatureExtractorProtocol:
        return self._model_registry.get_feature_extractor()

    def _get_recommendation_engine(self) -> RecommendationEngineProtocol:
        return self._model_registry.get_recommendation_engine()

    @classmethod
    def preload_models(cls, gpu_enabled: Optional[bool] = None) -> None:
        """Eagerly load heavy shared models so the first request is fast."""

        RecommendationModelBootstrap.preload_models_for_environment(
            gpu_enabled=gpu_enabled
        )

    async def get_similar_loras(
        self,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Get LoRAs similar to the target LoRA."""

        repository = self._get_repository()
        embedding_manager = self._get_embedding_manager()
        engine = self._get_recommendation_engine()

        return await similar_loras_strategy(
            target_lora_id=target_lora_id,
            limit=limit,
            similarity_threshold=similarity_threshold,
            weights=weights,
            repository=repository,
            embedding_manager=embedding_manager,
            engine=engine,
            metrics=self._metrics,
        )

    async def get_recommendations_for_prompt(
        self,
        prompt: str,
        active_loras: List[str] = None,
        limit: int = 10,
        style_preference: Optional[str] = None,
    ) -> List[RecommendationItem]:
        """Get LoRA recommendations that enhance a given prompt."""

        repository = self._get_repository()
        embedder = self._get_semantic_embedder()

        return await prompt_strategy(
            prompt=prompt,
            active_loras=active_loras,
            limit=limit,
            style_preference=style_preference,
            repository=repository,
            embedder=embedder,
            device=self.device,
            metrics=self._metrics,
        )

    async def compute_embeddings_for_lora(
        self,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:
        """Compute and store embeddings for a single LoRA."""
        return await self._get_embedding_manager().compute_embeddings_for_lora(
            adapter_id,
            force_recompute=force_recompute,
        )

    async def batch_compute_embeddings(
        self,
        adapter_ids: List[str] = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple LoRAs efficiently."""
        return await self._get_embedding_manager().batch_compute_embeddings(
            adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
        )

    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""
        return self._get_repository().record_feedback(feedback)

    def update_user_preference(
        self,
        preference: UserPreferenceRequest,
    ) -> UserPreference:
        """Create or update a persisted user preference record."""
        return self._get_repository().update_user_preference(preference)

    async def rebuild_similarity_index(
        self,
        *,
        force: bool = False,
    ) -> IndexRebuildResponse:
        """Rebuild the cached similarity index and persist it to disk."""

        manager = self._get_persistence_manager()
        return await manager.rebuild_similarity_index(force=force)

    @property
    def index_cache_path(self) -> str:
        """Expose the index cache path for compatibility and testing."""

        return str(self._get_persistence_manager().index_cache_path)

    @index_cache_path.setter
    def index_cache_path(self, value: str) -> None:
        self._get_persistence_manager().index_cache_path = value

    @property
    def embedding_cache_dir(self) -> str:
        """Expose the embedding cache directory for configuration."""

        return str(self._get_persistence_manager().embedding_cache_dir)

    @embedding_cache_dir.setter
    def embedding_cache_dir(self, value: str) -> None:
        self._get_persistence_manager().embedding_cache_dir = value

    def get_recommendation_stats(self) -> RecommendationStats:
        """Get comprehensive recommendation system statistics."""
        repository = self._get_repository()

        total_loras = repository.count_active_adapters()
        loras_with_embeddings = repository.count_lora_embeddings()
        embedding_coverage = (
            loras_with_embeddings / total_loras if total_loras > 0 else 0.0
        )

        user_preferences_count = repository.count_user_preferences()
        session_count = repository.count_recommendation_sessions()
        feedback_count = repository.count_feedback()

        avg_query_time = self._metrics.average_query_time
        cache_hit_rate = self._metrics.cache_hit_rate

        memory_usage = 0.0
        if self.gpu_enabled:
            try:
                import torch
                if torch.cuda.is_available():
                    memory_usage = torch.cuda.memory_allocated() / 1024**3
            except ImportError:
                pass

        last_index_update = (
            repository.get_last_embedding_update()
            or datetime.now(timezone.utc)
        )

        return RecommendationStats(
            total_loras=total_loras,
            loras_with_embeddings=loras_with_embeddings,
            embedding_coverage=embedding_coverage,
            avg_recommendation_time_ms=avg_query_time,
            cache_hit_rate=cache_hit_rate,
            total_sessions=session_count,
            user_preferences_count=user_preferences_count,
            feedback_count=feedback_count,
            model_memory_usage_gb=memory_usage,
            last_index_update=last_index_update,
        )

    @property
    def _total_queries(self) -> int:
        """Backwards compatibility for legacy metrics access."""
        return self._metrics.total_queries

    @property
    def _total_query_time(self) -> float:
        return self._metrics.total_query_time_ms

    @property
    def _cache_hits(self) -> int:
        return self._metrics.cache_hits

    @property
    def _cache_misses(self) -> int:
        return self._metrics.cache_misses

    def get_embedding_status(self, adapter_id: str) -> EmbeddingStatus:
        """Get embedding status for a specific adapter."""
        embedding = self.db_session.get(LoRAEmbedding, adapter_id)
        
        if not embedding:
            return EmbeddingStatus(
                adapter_id=adapter_id,
                has_semantic_embedding=False,
                has_artistic_embedding=False,
                has_technical_embedding=False,
                has_extracted_features=False,
                needs_recomputation=True,
            )
        
        return EmbeddingStatus(
            adapter_id=adapter_id,
            has_semantic_embedding=bool(embedding.semantic_embedding),
            has_artistic_embedding=bool(embedding.artistic_embedding),
            has_technical_embedding=bool(embedding.technical_embedding),
            has_extracted_features=bool(embedding.extracted_keywords),
            last_computed=embedding.last_computed,
            needs_recomputation=False,
        )
