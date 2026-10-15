"""Recommendation service provider factories and protocols."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session

from ..queue import QueueOrchestrator
from ..recommendation_jobs import RecommendationJobService
from ..recommendations import (
    EmbeddingService,
    RecommendationModelRegistry,
    RecommendationRepository,
    RecommendationService,
)


class RecommendationServiceFactory(Protocol):
    """Callable protocol for creating :class:`RecommendationService` instances."""

    def __call__(
        self,
        db_session: Session,
        *,
        gpu_available: bool,
    ) -> RecommendationService:
        """Create a :class:`RecommendationService` instance."""
        ...


def make_recommendation_service(
    db_session: Session,
    *,
    gpu_available: bool,
) -> RecommendationService:
    """Create a :class:`RecommendationService` bound to ``db_session``."""
    model_registry = RecommendationModelRegistry(gpu_enabled=gpu_available)
    repository = RecommendationRepository(db_session)
    return RecommendationService(
        repository=repository,
        embeddings=EmbeddingService(repository, model_registry),
        model_registry=model_registry,
    )


class RecommendationJobServiceFactory(Protocol):
    """Callable protocol for creating :class:`RecommendationJobService` instances."""

    def __call__(
        self,
        queue_orchestrator: QueueOrchestrator,
        *,
        gpu_available: bool,
    ) -> RecommendationJobService:
        """Create a :class:`RecommendationJobService` instance."""
        ...


def make_recommendation_job_service(
    queue_orchestrator: QueueOrchestrator,
    *,
    gpu_available: bool,
) -> RecommendationJobService:
    """Create a :class:`RecommendationJobService` on the shared queue."""
    return RecommendationJobService(queue_orchestrator, gpu_available=gpu_available)


__all__ = [
    "RecommendationJobServiceFactory",
    "RecommendationServiceFactory",
    "make_recommendation_job_service",
    "make_recommendation_service",
]
