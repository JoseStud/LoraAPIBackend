"""Recommendation service for LoRA adapter discovery and learning."""

import asyncio
import pickle
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import numpy as np
from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import (
    Adapter,
    LoRAEmbedding,
    RecommendationFeedback,
    RecommendationSession,
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


class RecommendationService:
    """Service for generating intelligent LoRA recommendations."""

    # Shared model caches to avoid reloading transformers for every request
    _shared_lock: Lock = Lock()
    _shared_device: Optional[str] = None
    _shared_semantic_embedder = None
    _shared_feature_extractor = None
    _shared_recommendation_engine = None

    def __init__(self, db_session: Session, gpu_enabled: bool = False):
        """Initialize recommendation service.
        
        Args:
            db_session: Database session
            gpu_enabled: Whether to use GPU acceleration (requires CUDA setup)

        """
        self.db_session = db_session
        self.gpu_enabled = gpu_enabled
        self.device = 'cuda' if gpu_enabled else 'cpu'
        
        # Initialize embedding models lazily (per-instance references)
        self._semantic_embedder = None
        self._feature_extractor = None
        self._recommendation_engine = None
        
        # Performance tracking
        self._total_queries = 0
        self._total_query_time = 0.0
        self._cache_hits = 0
        self._cache_misses = 0
        
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

    @classmethod
    def _ensure_shared_models(cls, device: str, gpu_enabled: bool) -> None:
        """Ensure heavy models are loaded once per process for the given device."""
        with cls._shared_lock:
            if cls._shared_device != device:
                # Device changed; drop existing caches so we reload with the new target
                cls._shared_semantic_embedder = None
                cls._shared_feature_extractor = None
                cls._shared_recommendation_engine = None
                cls._shared_device = device

            if cls._shared_semantic_embedder is None:
                from .recommendation_models import LoRASemanticEmbedder

                batch_size = 32 if gpu_enabled else 16
                cls._shared_semantic_embedder = LoRASemanticEmbedder(
                    device=device,
                    batch_size=batch_size,
                )

            if cls._shared_feature_extractor is None:
                from .recommendation_models import GPULoRAFeatureExtractor

                cls._shared_feature_extractor = GPULoRAFeatureExtractor(device=device)

            if cls._shared_recommendation_engine is None:
                from .recommendation_models import LoRARecommendationEngine

                cls._shared_recommendation_engine = LoRARecommendationEngine(
                    cls._shared_feature_extractor,
                    device=device,
                )

    def _get_semantic_embedder(self):
        """Lazy initialization of semantic embedding models."""
        if self._semantic_embedder is None:
            type(self)._ensure_shared_models(self.device, self.gpu_enabled)
            self._semantic_embedder = type(self)._shared_semantic_embedder
        return self._semantic_embedder

    def _require_db_session(self) -> Session:
        """Return the active database session or raise if unavailable."""
        if self.db_session is None:
            raise RuntimeError("RecommendationService requires an active database session")
        return self.db_session

    def _get_feature_extractor(self):
        """Lazy initialization of feature extraction models."""
        if self._feature_extractor is None:
            type(self)._ensure_shared_models(self.device, self.gpu_enabled)
            self._feature_extractor = type(self)._shared_feature_extractor
        return self._feature_extractor

    def _get_recommendation_engine(self):
        """Lazy initialization of recommendation engine."""
        if self._recommendation_engine is None:
            type(self)._ensure_shared_models(self.device, self.gpu_enabled)
            self._recommendation_engine = type(self)._shared_recommendation_engine
        return self._recommendation_engine

    @classmethod
    def preload_models(cls, gpu_enabled: Optional[bool] = None) -> None:
        """Eagerly load heavy shared models so the first request is fast."""
        if gpu_enabled is None:
            gpu_enabled = cls.is_gpu_available()

        # We don't need a DB session to warm the caches
        temp = cls(db_session=None, gpu_enabled=gpu_enabled)  # type: ignore[arg-type]
        temp._get_semantic_embedder()
        temp._get_feature_extractor()
        temp._get_recommendation_engine()

    async def get_similar_loras(
        self,
        target_lora_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.1,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[RecommendationItem]:
        """Get LoRAs similar to the target LoRA.
        
        Args:
            target_lora_id: ID of the target LoRA
            limit: Maximum number of recommendations
            similarity_threshold: Minimum similarity score
            weights: Custom weights for similarity components
            
        Returns:
            List of recommendation items

        """
        start_time = time.time()
        
        # Get target LoRA
        target_lora = self.db_session.get(Adapter, target_lora_id)
        if not target_lora:
            raise ValueError(f"LoRA {target_lora_id} not found")
        
        # Ensure embeddings exist
        await self._ensure_embeddings_exist([target_lora])
        
        # Get recommendation engine
        engine = self._get_recommendation_engine()
        
        # Check if index is built
        if not hasattr(engine, 'lora_ids') or not engine.lora_ids:
            await self._build_similarity_index()

        # If the index still has no items (e.g. embeddings couldn't be generated)
        if not engine.lora_ids:
            return []

        # Generate recommendations
        recommendations = await asyncio.to_thread(
            engine.get_recommendations,
            target_lora,
            limit * 2,  # Get more candidates for filtering
            weights,
        )
        
        # Filter by similarity threshold and convert to schema
        filtered_recommendations = []
        for rec in recommendations:
            if rec['similarity_score'] >= similarity_threshold:
                candidate_lora = self.db_session.get(Adapter, rec['lora_id'])
                if candidate_lora:
                    filtered_recommendations.append(
                        RecommendationItem(
                            lora_id=rec['lora_id'],
                            lora_name=candidate_lora.name,
                            lora_description=candidate_lora.description,
                            similarity_score=rec['similarity_score'],
                            final_score=rec['final_score'],
                            explanation=rec['explanation'],
                            semantic_similarity=rec.get('semantic_similarity'),
                            artistic_similarity=rec.get('artistic_similarity'),
                            technical_similarity=rec.get('technical_similarity'),
                            quality_boost=rec.get('quality_boost'),
                            popularity_boost=rec.get('popularity_boost'),
                            recency_boost=rec.get('recency_boost'),
                            metadata={
                                'tags': candidate_lora.tags[:5],  # Limit tags
                                'author': candidate_lora.author_username,
                                'sd_version': candidate_lora.sd_version,
                                'nsfw_level': candidate_lora.nsfw_level,
                            },
                        ),
                    )
                    
                    if len(filtered_recommendations) >= limit:
                        break
        
        # Track performance
        query_time = (time.time() - start_time) * 1000
        self._total_queries += 1
        self._total_query_time += query_time
        
        return filtered_recommendations

    async def get_recommendations_for_prompt(
        self,
        prompt: str,
        active_loras: List[str] = None,
        limit: int = 10,
        style_preference: Optional[str] = None,
    ) -> List[RecommendationItem]:
        """Get LoRA recommendations that enhance a given prompt.
        
        Args:
            prompt: Text prompt to enhance
            active_loras: Currently active LoRA IDs to exclude
            limit: Maximum number of recommendations
            style_preference: Preferred art style
            
        Returns:
            List of recommendation items

        """
        start_time = time.time()
        active_loras = active_loras or []
        
        # Get semantic embedder
        embedder = self._get_semantic_embedder()
        
        # Generate prompt embedding
        prompt_embedding = await asyncio.to_thread(
            embedder.primary_model.encode,
            prompt,
            device=self.device,
            convert_to_numpy=True,
        )
        
        # Get all LoRAs with embeddings
        stmt = select(Adapter, LoRAEmbedding).join(
            LoRAEmbedding, Adapter.id == LoRAEmbedding.adapter_id,
        ).where(
            Adapter.active,
            ~Adapter.id.in_(active_loras),  # Exclude active LoRAs
        )
        
        results = self.db_session.exec(stmt).all()
        
        # Calculate similarities
        recommendations = []
        for adapter, embedding in results:
            if embedding.semantic_embedding:
                # Deserialize embedding
                lora_embedding = pickle.loads(embedding.semantic_embedding)
                
                # Calculate cosine similarity, guarding against zero vectors to avoid NaN
                prompt_norm = float(np.linalg.norm(prompt_embedding))
                lora_norm = float(np.linalg.norm(lora_embedding))
                denominator = prompt_norm * lora_norm
                if denominator == 0.0:
                    similarity = 0.0
                else:
                    similarity = float(np.dot(prompt_embedding, lora_embedding) / denominator)
                
                # Apply style preference boost
                style_boost = 0.0
                if style_preference and embedding.predicted_style:
                    if style_preference.lower() in embedding.predicted_style.lower():
                        style_boost = 0.2
                
                # Calculate final score
                final_score = similarity + style_boost
                
                # Generate explanation
                explanation_parts = [f"Prompt similarity: {similarity:.2f}"]
                if style_boost > 0:
                    style_text = f"Style match: {embedding.predicted_style}"
                    explanation_parts.append(style_text)
                if adapter.tags:
                    explanation_parts.append(f"Tags: {', '.join(adapter.tags[:3])}")
                
                recommendations.append(
                    RecommendationItem(
                        lora_id=adapter.id,
                        lora_name=adapter.name,
                        lora_description=adapter.description,
                        similarity_score=similarity,
                        final_score=final_score,
                        explanation=" | ".join(explanation_parts),
                        semantic_similarity=similarity,
                        metadata={
                            'tags': adapter.tags[:5],
                            'author': adapter.author_username,
                            'sd_version': adapter.sd_version,
                            'nsfw_level': adapter.nsfw_level,
                            'predicted_style': embedding.predicted_style,
                        },
                    ),
                )
        
        # Sort by final score and limit results
        recommendations.sort(key=lambda x: x.final_score, reverse=True)
        
        # Track performance
        query_time = (time.time() - start_time) * 1000
        self._total_queries += 1
        self._total_query_time += query_time
        
        return recommendations[:limit]

    async def compute_embeddings_for_lora(
        self,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:
        """Compute and store embeddings for a single LoRA.
        
        Args:
            adapter_id: ID of the adapter
            force_recompute: Whether to recompute existing embeddings
            
        Returns:
            True if embeddings were computed successfully

        """
        # Get adapter
        adapter = self.db_session.get(Adapter, adapter_id)
        if not adapter:
            raise ValueError(f"Adapter {adapter_id} not found")
        
        # Check if embeddings already exist
        existing_embedding = self.db_session.get(LoRAEmbedding, adapter_id)
        if existing_embedding and not force_recompute:
            return True
        
        try:
            # Get feature extractor
            extractor = self._get_feature_extractor()
            
            # Extract features
            features = await asyncio.to_thread(
                extractor.extract_advanced_features,
                adapter,
            )
            
            # Serialize embeddings
            semantic_bytes = pickle.dumps(features['semantic_embedding'])
            artistic_bytes = pickle.dumps(features['artistic_embedding'])
            technical_bytes = pickle.dumps(features['technical_embedding'])
            
            # Create or update embedding record
            if existing_embedding:
                existing_embedding.semantic_embedding = semantic_bytes
                existing_embedding.artistic_embedding = artistic_bytes
                existing_embedding.technical_embedding = technical_bytes
                keywords = features.get('extracted_keywords', [])
                existing_embedding.extracted_keywords = keywords
                existing_embedding.keyword_scores = features.get('keyword_scores', [])
                existing_embedding.predicted_style = features.get('predicted_style')
                existing_embedding.style_confidence = features.get('style_confidence')
                existing_embedding.sentiment_label = features.get('sentiment_label')
                existing_embedding.sentiment_score = features.get('sentiment_score')
                existing_embedding.quality_score = features.get('quality_score')
                existing_embedding.popularity_score = features.get('popularity_score')
                existing_embedding.recency_score = features.get('recency_score')
                compat_score = features.get('sd_compatibility_score')
                existing_embedding.compatibility_score = compat_score
                existing_embedding.last_computed = datetime.now(timezone.utc)
                existing_embedding.updated_at = datetime.now(timezone.utc)
            else:
                new_embedding = LoRAEmbedding(
                    adapter_id=adapter_id,
                    semantic_embedding=semantic_bytes,
                    artistic_embedding=artistic_bytes,
                    technical_embedding=technical_bytes,
                    extracted_keywords=features.get('extracted_keywords', []),
                    keyword_scores=features.get('keyword_scores', []),
                    predicted_style=features.get('predicted_style'),
                    style_confidence=features.get('style_confidence'),
                    sentiment_label=features.get('sentiment_label'),
                    sentiment_score=features.get('sentiment_score'),
                    quality_score=features.get('quality_score'),
                    popularity_score=features.get('popularity_score'),
                    recency_score=features.get('recency_score'),
                    compatibility_score=features.get('sd_compatibility_score'),
                )
                self.db_session.add(new_embedding)
            
            self.db_session.commit()
            return True
            
        except Exception as e:
            self.db_session.rollback()
            raise RuntimeError(f"Failed to compute embeddings for {adapter_id}: {e}")

    async def batch_compute_embeddings(
        self,
        adapter_ids: List[str] = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple LoRAs efficiently.
        
        Args:
            adapter_ids: Specific adapter IDs to process (None for all)
            force_recompute: Whether to recompute existing embeddings
            batch_size: Number of adapters to process in each batch
            
        Returns:
            Processing statistics

        """
        start_time = time.time()
        
        # Get adapters to process
        if adapter_ids:
            stmt = select(Adapter).where(Adapter.id.in_(adapter_ids))
        else:
            stmt = select(Adapter).where(Adapter.active)
        
        adapters = list(self.db_session.exec(stmt))

        skipped_due_to_existing = 0

        # Filter out adapters that already have embeddings
        if not force_recompute:
            pre_filter_count = len(adapters)
            adapter_ids_to_check = [a.id for a in adapters]

            existing_ids = set()
            if adapter_ids_to_check:
                stmt = select(LoRAEmbedding.adapter_id).where(
                    LoRAEmbedding.adapter_id.in_(adapter_ids_to_check),
                )
                existing_ids.update(
                    self.db_session.exec(stmt).all()
                )

            adapters = [a for a in adapters if a.id not in existing_ids]
            skipped_due_to_existing = pre_filter_count - len(adapters)

        processed_count = 0
        error_count = 0
        errors = []
        
        # Process in batches
        for i in range(0, len(adapters), batch_size):
            batch = adapters[i:i + batch_size]
            
            try:
                # Process batch
                for adapter in batch:
                    try:
                        await self.compute_embeddings_for_lora(
                            adapter.id, 
                            force_recompute,
                        )
                        processed_count += 1
                    except Exception as e:
                        error_count += 1
                        errors.append({
                            'adapter_id': adapter.id,
                            'error': str(e),
                        })
                        
            except Exception as e:
                error_count += len(batch)
                for adapter in batch:
                    errors.append({
                        'adapter_id': adapter.id,
                        'error': f"Batch processing failed: {e}",
                    })

        processing_time = time.time() - start_time

        return {
            'processed_count': processed_count,
            'skipped_count': skipped_due_to_existing,
            'error_count': error_count,
            'processing_time_seconds': processing_time,
            'errors': errors,
            'completed_at': datetime.now(timezone.utc),
        }

    async def _ensure_embeddings_exist(self, adapters: List[Adapter]):
        """Ensure embeddings exist for given adapters."""
        adapter_ids = [a.id for a in adapters]
        
        # Check which adapters need embeddings
        stmt = select(LoRAEmbedding.adapter_id).where(
            LoRAEmbedding.adapter_id.in_(adapter_ids),
        )
        existing_ids = set(self.db_session.exec(stmt))
        
        missing_ids = [aid for aid in adapter_ids if aid not in existing_ids]
        
        if missing_ids:
            await self.batch_compute_embeddings(missing_ids)

    async def _build_similarity_index(self):
        """Build or rebuild the similarity index for fast recommendations."""
        session = self._require_db_session()
        # Get all LoRAs with embeddings
        stmt = select(Adapter).join(
            LoRAEmbedding, Adapter.id == LoRAEmbedding.adapter_id,
        ).where(Adapter.active)

        adapters = list(session.exec(stmt))

        if adapters:
            engine = self._get_recommendation_engine()
            await asyncio.to_thread(engine.build_similarity_index, adapters)

    def record_feedback(self, feedback: UserFeedbackRequest) -> RecommendationFeedback:
        """Persist recommendation feedback for later learning."""

        session = self._require_db_session()

        recommendation_session = session.get(RecommendationSession, feedback.session_id)
        if recommendation_session is None:
            raise ValueError(
                f"Recommendation session {feedback.session_id} not found",
            )

        adapter = session.get(Adapter, feedback.recommended_lora_id)
        if adapter is None:
            raise ValueError(
                f"Adapter {feedback.recommended_lora_id} not found",
            )

        feedback_record = RecommendationFeedback(
            session_id=feedback.session_id,
            recommended_lora_id=feedback.recommended_lora_id,
            feedback_type=feedback.feedback_type,
            feedback_reason=feedback.feedback_reason,
            implicit_signal=feedback.implicit_signal,
        )

        session.add(feedback_record)

        # Track most recent feedback per recommendation in the session payload
        feedback_map = recommendation_session.user_feedback or {}
        feedback_map[feedback.recommended_lora_id] = {
            'feedback_type': feedback.feedback_type,
            'implicit_signal': feedback.implicit_signal,
            'feedback_reason': feedback.feedback_reason,
            'recorded_at': datetime.now(timezone.utc).isoformat(),
        }
        recommendation_session.user_feedback = feedback_map
        session.add(recommendation_session)

        session.commit()
        session.refresh(feedback_record)

        return feedback_record

    def update_user_preference(
        self,
        preference: UserPreferenceRequest,
    ) -> UserPreference:
        """Create or update a persisted user preference record."""

        session = self._require_db_session()
        stmt = select(UserPreference).where(
            UserPreference.preference_type == preference.preference_type,
            UserPreference.preference_value == preference.preference_value,
        )

        existing = session.exec(stmt).first()
        now = datetime.now(timezone.utc)
        learned_from = 'explicit' if preference.explicit else 'feedback'

        if existing:
            existing.confidence = preference.confidence
            existing.learned_from = learned_from
            existing.evidence_count += 1
            existing.last_evidence_at = now
            existing.updated_at = now
            session.add(existing)
            session.commit()
            session.refresh(existing)
            return existing

        new_preference = UserPreference(
            preference_type=preference.preference_type,
            preference_value=preference.preference_value,
            confidence=preference.confidence,
            learned_from=learned_from,
            evidence_count=1,
            last_evidence_at=now,
        )
        session.add(new_preference)
        session.commit()
        session.refresh(new_preference)
        return new_preference

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
        session = self._require_db_session()

        # Count total LoRAs
        total_loras = len(list(session.exec(
            select(Adapter).where(Adapter.active),
        )))

        # Count LoRAs with embeddings
        loras_with_embeddings = len(list(session.exec(
            select(LoRAEmbedding),
        )))
        
        # Calculate coverage
        embedding_coverage = (
            loras_with_embeddings / total_loras if total_loras > 0 else 0.0
        )
        
        # Get user preference count
        user_preferences_count = len(list(session.exec(
            select(UserPreference),
        )))

        # Get session count
        session_count = len(list(session.exec(
            select(RecommendationSession),
        )))

        feedback_count = session.exec(
            select(func.count()).select_from(RecommendationFeedback),
        ).one()
        
        # Calculate average query time
        avg_query_time = (
            self._total_query_time / self._total_queries 
            if self._total_queries > 0 else 0.0
        )
        
        # Calculate cache hit rate
        total_cache_requests = self._cache_hits + self._cache_misses
        cache_hit_rate = (
            self._cache_hits / total_cache_requests 
            if total_cache_requests > 0 else 0.0
        )
        
        # Get GPU memory usage if available
        memory_usage = 0.0
        if self.gpu_enabled:
            try:
                import torch
                if torch.cuda.is_available():
                    memory_usage = torch.cuda.memory_allocated() / 1024**3
            except ImportError:
                pass
        
        # Get last embedding update
        last_embedding = session.exec(
            select(LoRAEmbedding).order_by(LoRAEmbedding.last_computed.desc()),
        ).first()
        last_index_update = (
            last_embedding.last_computed if last_embedding 
            else datetime.now(timezone.utc)
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
