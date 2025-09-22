"""Embedding and similarity index management for recommendations."""

import asyncio
import pickle
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Sequence

from sqlmodel import Session, select

from backend.models import Adapter, LoRAEmbedding
from .model_registry import RecommendationModelRegistry


class EmbeddingManager:
    """Handle embedding computations and similarity index operations."""

    def __init__(
        self,
        session: Session,
        model_registry: RecommendationModelRegistry,
        *,
        feature_extractor_getter: Callable[[], Any] | None = None,
        recommendation_engine_getter: Callable[[], Any] | None = None,
        single_embedding_compute: Callable[[str, bool], Awaitable[bool]] | None = None,
    ):
        self._session = session
        self._model_registry = model_registry
        self._feature_extractor_getter = (
            feature_extractor_getter or self._model_registry.get_feature_extractor
        )
        self._recommendation_engine_getter = (
            recommendation_engine_getter
            or self._model_registry.get_recommendation_engine
        )
        self._single_embedding_compute = single_embedding_compute

    def _get_feature_extractor(self):
        return self._feature_extractor_getter()

    def _get_recommendation_engine(self):
        return self._recommendation_engine_getter()

    async def compute_embeddings_for_lora(
        self,
        adapter_id: str,
        force_recompute: bool = False,
    ) -> bool:
        """Compute and persist embeddings for a single adapter."""
        adapter = self._session.get(Adapter, adapter_id)
        if not adapter:
            raise ValueError(f"Adapter {adapter_id} not found")

        existing_embedding = self._session.get(LoRAEmbedding, adapter_id)
        if existing_embedding and not force_recompute:
            return True

        try:
            extractor = self._get_feature_extractor()
            features = await asyncio.to_thread(
                extractor.extract_advanced_features,
                adapter,
            )

            semantic_bytes = pickle.dumps(features['semantic_embedding'])
            artistic_bytes = pickle.dumps(features['artistic_embedding'])
            technical_bytes = pickle.dumps(features['technical_embedding'])

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
                existing_embedding.compatibility_score = features.get('sd_compatibility_score')
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
                self._session.add(new_embedding)

            self._session.commit()
            return True

        except Exception as exc:  # pragma: no cover - defensive rollback
            self._session.rollback()
            raise RuntimeError(
                f"Failed to compute embeddings for {adapter_id}: {exc}",
            ) from exc

    async def batch_compute_embeddings(
        self,
        adapter_ids: Sequence[str] | None = None,
        force_recompute: bool = False,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """Compute embeddings for multiple adapters efficiently."""
        start_time = time.time()

        if adapter_ids:
            stmt = select(Adapter).where(Adapter.id.in_(adapter_ids))
        else:
            stmt = select(Adapter).where(Adapter.active)

        adapters = list(self._session.exec(stmt))

        skipped_due_to_existing = 0

        if not force_recompute:
            pre_filter_count = len(adapters)
            adapter_ids_to_check = [adapter.id for adapter in adapters]

            existing_ids = set()
            if adapter_ids_to_check:
                stmt = select(LoRAEmbedding.adapter_id).where(
                    LoRAEmbedding.adapter_id.in_(adapter_ids_to_check),
                )
                existing_ids.update(self._session.exec(stmt).all())

            adapters = [adapter for adapter in adapters if adapter.id not in existing_ids]
            skipped_due_to_existing = pre_filter_count - len(adapters)

        processed_count = 0
        error_count = 0
        errors = []

        compute_embedding = self._single_embedding_compute or self.compute_embeddings_for_lora

        for start in range(0, len(adapters), batch_size):
            batch = adapters[start:start + batch_size]

            try:
                for adapter in batch:
                    try:
                        await compute_embedding(
                            adapter.id,
                            force_recompute,
                        )
                        processed_count += 1
                    except Exception as exc:  # pragma: no cover - detailed stats only
                        error_count += 1
                        errors.append(
                            {
                                'adapter_id': adapter.id,
                                'error': str(exc),
                            },
                        )

            except Exception as exc:  # pragma: no cover - full batch failure path
                error_count += len(batch)
                for adapter in batch:
                    errors.append(
                        {
                            'adapter_id': adapter.id,
                            'error': f"Batch processing failed: {exc}",
                        },
                    )

        processing_time = time.time() - start_time

        return {
            'processed_count': processed_count,
            'skipped_count': skipped_due_to_existing,
            'error_count': error_count,
            'processing_time_seconds': processing_time,
            'errors': errors,
            'completed_at': datetime.now(timezone.utc),
        }

    async def ensure_embeddings_exist(self, adapters: Sequence[Adapter]) -> None:
        """Ensure embeddings exist for the provided adapters."""
        adapter_ids = [adapter.id for adapter in adapters]

        stmt = select(LoRAEmbedding.adapter_id).where(
            LoRAEmbedding.adapter_id.in_(adapter_ids),
        )
        existing_ids = set(self._session.exec(stmt))

        missing_ids = [adapter_id for adapter_id in adapter_ids if adapter_id not in existing_ids]

        if missing_ids:
            await self.batch_compute_embeddings(missing_ids)

    async def build_similarity_index(self) -> None:
        """Build the in-memory similarity index for active adapters."""
        stmt = select(Adapter).join(
            LoRAEmbedding, Adapter.id == LoRAEmbedding.adapter_id,
        ).where(Adapter.active)

        adapters = list(self._session.exec(stmt))

        if adapters:
            engine = self._get_recommendation_engine()
            await asyncio.to_thread(engine.build_similarity_index, adapters)
