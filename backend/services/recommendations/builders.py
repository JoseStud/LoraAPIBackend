"""Shared builders for assembling recommendation service collaborators."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlmodel import Session

from .config import RecommendationConfig
from .embedding_manager import EmbeddingManager
from .embedding_repository import LoRAEmbeddingRepository
from .interfaces import (
    EmbeddingWorkflow,
    RecommendationMetricsTracker,
    RecommendationRepository,
)
from .model_registry import RecommendationModelRegistry
from .persistence_manager import RecommendationPersistenceManager
from .persistence_service import RecommendationPersistenceService
from .use_cases import (
    PromptRecommendationUseCase,
    SimilarLoraUseCase,
    TriggerRecommendationUseCase,
)


@dataclass(frozen=True)
class EmbeddingStack:
    """Grouping of embedding-related collaborators."""

    repository: LoRAEmbeddingRepository
    manager: EmbeddingManager


@dataclass(frozen=True)
class PersistenceComponents:
    """Grouping of persistence helpers for recommendation caches."""

    manager: RecommendationPersistenceManager
    service: RecommendationPersistenceService
    config: RecommendationConfig


@dataclass(frozen=True)
class UseCaseBundle:
    """Grouping of high level recommendation use cases."""

    similar_lora: SimilarLoraUseCase
    prompt_recommendation: PromptRecommendationUseCase
    trigger_recommendation: TriggerRecommendationUseCase


def build_embedding_stack(
    *,
    db_session: Optional[Session],
    model_registry: RecommendationModelRegistry,
    embedding_repository: Optional[LoRAEmbeddingRepository] = None,
    embedding_manager: Optional[EmbeddingManager] = None,
) -> EmbeddingStack:
    """Return embedding collaborators, creating missing pieces as needed."""
    if embedding_repository is None:
        if db_session is None:
            raise ValueError(
                "db_session is required when embedding_repository is not provided",
            )
        embedding_repository = LoRAEmbeddingRepository(db_session)

    if embedding_manager is None:
        embedding_manager = EmbeddingManager(
            embedding_repository,
            model_registry,
        )

    return EmbeddingStack(
        repository=embedding_repository,
        manager=embedding_manager,
    )


def build_persistence_components(
    *,
    embedding_manager: Optional[EmbeddingManager],
    model_registry: RecommendationModelRegistry,
    persistence_manager: Optional[RecommendationPersistenceManager] = None,
    persistence_service: Optional[RecommendationPersistenceService] = None,
    config: Optional[RecommendationConfig] = None,
) -> PersistenceComponents:
    """Return persistence collaborators, inferring missing pieces."""
    manager = persistence_manager
    if manager is None:
        if persistence_service is not None:
            manager = getattr(persistence_service, "_manager", None)
        if manager is None:
            if embedding_manager is None:
                raise ValueError(
                    "embedding_manager is required when creating "
                    "persistence components",
                )
            manager = RecommendationPersistenceManager(
                embedding_manager,
                model_registry.get_recommendation_engine,
            )

    service = persistence_service or RecommendationPersistenceService(manager)
    config = config or RecommendationConfig(service)

    return PersistenceComponents(
        manager=manager,
        service=service,
        config=config,
    )


def build_use_cases(
    *,
    repository: RecommendationRepository,
    embedding_workflow: EmbeddingWorkflow,
    model_registry: RecommendationModelRegistry,
    metrics_tracker: RecommendationMetricsTracker,
    device: str,
    similar_use_case: Optional[SimilarLoraUseCase] = None,
    prompt_use_case: Optional[PromptRecommendationUseCase] = None,
    trigger_use_case: Optional[TriggerRecommendationUseCase] = None,
) -> UseCaseBundle:
    """Return high level use cases, defaulting to standard implementations."""
    similar = similar_use_case or SimilarLoraUseCase(
        repository=repository,
        embedding_workflow=embedding_workflow,
        engine_provider=model_registry.get_recommendation_engine,
        metrics=metrics_tracker,
    )
    prompt = prompt_use_case or PromptRecommendationUseCase(
        repository=repository,
        embedder_provider=model_registry.get_semantic_embedder,
        metrics=metrics_tracker,
        device=device,
    )

    trigger = trigger_use_case or TriggerRecommendationUseCase(
        repository=repository,
        trigger_engine_provider=model_registry.get_trigger_engine,
        metrics=metrics_tracker,
    )

    return UseCaseBundle(
        similar_lora=similar,
        prompt_recommendation=prompt,
        trigger_recommendation=trigger,
    )
