"""Recommendation service for LoRA adapter discovery and learning."""

import logging
import pickle
import time
from datetime import datetime, timezone
from pathlib import Path
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
from .model_registry import RecommendationModelRegistry
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
        model_registry: Optional[RecommendationModelRegistry] = None,
        embedding_manager: Optional[EmbeddingManager] = None,
        repository: Optional[RecommendationRepository] = None,
    ):
        """Initialize recommendation service.
        
        Args:
            db_session: Database session
            gpu_enabled: Whether to use GPU acceleration (requires CUDA setup)

        """
        self.db_session = db_session
        self.gpu_enabled = gpu_enabled
        self.device = 'cuda' if gpu_enabled else 'cpu'
        self._logger = logger or logging.getLogger(__name__)

        self._model_registry = model_registry or RecommendationModelRegistry(
            device=self.device,
            gpu_enabled=self.gpu_enabled,
            logger=self._logger,
        )
        self._embedding_manager = embedding_manager
        self._repository = repository
        self._metrics = RecommendationMetrics()
        
        # Configuration
        self.embedding_cache_dir = "cache/embeddings"
        self.index_cache_path = "cache/similarity_index.pkl"
        Path(self.embedding_cache_dir).mkdir(parents=True, exist_ok=True)
        Path(self.index_cache_path).parent.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def is_gpu_available() -> bool:
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
        if gpu_enabled is None:
            gpu_enabled = cls.is_gpu_available()

        device = 'cuda' if gpu_enabled else 'cpu'
        RecommendationModelRegistry.preload_models(device=device, gpu_enabled=gpu_enabled)

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

    async def _build_similarity_index(self):
        """Build or rebuild the similarity index for fast recommendations."""
        await self._get_embedding_manager().build_similarity_index()

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

        engine = self._get_recommendation_engine()
        index_file = Path(self.index_cache_path)
        index_file.parent.mkdir(parents=True, exist_ok=True)

        if not force and getattr(engine, 'lora_ids', None):
            index_size = index_file.stat().st_size if index_file.exists() else 0
            return IndexRebuildResponse(
                status='skipped',
                indexed_items=len(engine.lora_ids),
                index_path=str(index_file),
                index_size_bytes=index_size,
                processing_time_seconds=0.0,
                rebuilt_at=datetime.now(timezone.utc),
                skipped=True,
                skipped_reason='existing_index',
            )

        start_time = time.time()

        await self._build_similarity_index()

        indexed_items = len(getattr(engine, 'lora_ids', []) or [])
        index_size = 0
        status = 'empty'
        skipped_reason = None

        if indexed_items:
            payload = {
                'lora_ids': engine.lora_ids,
                'semantic_embeddings': engine.semantic_embeddings,
                'artistic_embeddings': engine.artistic_embeddings,
                'technical_embeddings': engine.technical_embeddings,
            }
            with index_file.open('wb') as handle:
                pickle.dump(payload, handle)
            index_size = index_file.stat().st_size
            status = 'rebuilt'
        else:
            if index_file.exists():
                index_file.unlink()

        processing_time = time.time() - start_time

        return IndexRebuildResponse(
            status=status,
            indexed_items=indexed_items,
            index_path=str(index_file),
            index_size_bytes=index_size,
            processing_time_seconds=processing_time,
            rebuilt_at=datetime.now(timezone.utc),
            skipped=False,
            skipped_reason=skipped_reason,
        )

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
