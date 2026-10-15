"""Builder for :class:`ServiceRegistry` instances with cached shared dependencies."""

from __future__ import annotations

from threading import RLock
from typing import Callable, Optional, TypeVar, Union

from sqlmodel import Session

from .analytics_repository import AnalyticsRepository
from .delivery_repository import DeliveryJobRepository
from .queue import QueueOrchestrator, create_queue_orchestrator
from .recommendations import RecommendationService
from .service_registry import ServiceFactories, ServiceRegistry

T = TypeVar("T")

ConfigOverride = Union[T, Callable[[T], T]]


def _resolve_override(current: T, override: Optional[ConfigOverride[T]]) -> T:
    """Return the overridden configuration if provided."""
    if override is None:
        return current
    if callable(override):
        return override(current)
    return override


class ServiceContainerBuilder:
    """Build :class:`ServiceRegistry` objects that share one queue and GPU flag."""

    def __init__(
        self,
        *,
        factories: Optional[ServiceFactories] = None,
        queue_orchestrator_factory: Callable[
            [], QueueOrchestrator
        ] = create_queue_orchestrator,
        analytics_repository_factory: Callable[
            [Session], AnalyticsRepository
        ] = AnalyticsRepository,
        delivery_repository_factory: Callable[
            [Session], DeliveryJobRepository
        ] = DeliveryJobRepository,
        recommendation_gpu_detector: Callable[
            [], bool
        ] = RecommendationService.is_gpu_available,
    ) -> None:
        """Capture override factories and lazily constructed dependencies."""
        self._factories = factories or ServiceFactories()
        self._queue_orchestrator_factory = queue_orchestrator_factory
        self._analytics_repository_factory = analytics_repository_factory
        self._delivery_repository_factory = delivery_repository_factory
        self._recommendation_gpu_detector = recommendation_gpu_detector

        self._lock = RLock()
        self._cached_queue_orchestrator: Optional[QueueOrchestrator] = None
        self._cached_gpu_available: Optional[bool] = None

    def _get_queue_orchestrator(self) -> QueueOrchestrator:
        with self._lock:
            if self._cached_queue_orchestrator is None:
                self._cached_queue_orchestrator = self._queue_orchestrator_factory()
            return self._cached_queue_orchestrator

    def _get_gpu_available(self) -> bool:
        with self._lock:
            if self._cached_gpu_available is None:
                self._cached_gpu_available = self._recommendation_gpu_detector()
            return self._cached_gpu_available

    def reset_cached_queue_orchestrator(self) -> None:
        """Drop the cached queue orchestrator so the next build recreates it."""
        with self._lock:
            if self._cached_queue_orchestrator is not None:
                self._cached_queue_orchestrator.reset()
            self._cached_queue_orchestrator = None

    def invalidate_recommendation_gpu_cache(self) -> None:
        """Force the next build to recompute the GPU availability flag."""
        with self._lock:
            self._cached_gpu_available = None

    def get_recommendation_gpu_available(self) -> bool:
        """Return the cached recommendation GPU availability flag."""
        return self._get_gpu_available()

    def with_overrides(
        self,
        *,
        factories: Optional[ConfigOverride[ServiceFactories]] = None,
        queue_orchestrator_factory: Optional[Callable[[], QueueOrchestrator]] = None,
        analytics_repository_factory: Optional[
            Callable[[Session], AnalyticsRepository]
        ] = None,
        delivery_repository_factory: Optional[
            Callable[[Session], DeliveryJobRepository]
        ] = None,
        recommendation_gpu_detector: Optional[Callable[[], bool]] = None,
    ) -> ServiceContainerBuilder:
        """Return a new builder with overrides applied to the current configuration.

        ``factories`` is either a replacement :class:`ServiceFactories` or a
        callable that receives the current one, typically
        ``lambda f: dataclasses.replace(f, adapter=...)``.
        """
        return ServiceContainerBuilder(
            factories=_resolve_override(self._factories, factories),
            queue_orchestrator_factory=(
                queue_orchestrator_factory or self._queue_orchestrator_factory
            ),
            analytics_repository_factory=(
                analytics_repository_factory or self._analytics_repository_factory
            ),
            delivery_repository_factory=(
                delivery_repository_factory or self._delivery_repository_factory
            ),
            recommendation_gpu_detector=(
                recommendation_gpu_detector or self._recommendation_gpu_detector
            ),
        )

    def build(
        self,
        db_session: Session,
        *,
        queue_orchestrator: Optional[QueueOrchestrator] = None,
        delivery_repository: Optional[DeliveryJobRepository] = None,
        analytics_repository: Optional[AnalyticsRepository] = None,
        recommendation_gpu_available: Optional[bool] = None,
    ) -> ServiceRegistry:
        """Create a :class:`ServiceRegistry` wired with the configured dependencies.

        Args:
            db_session: Active SQLModel session used to construct repositories and
                services.
            queue_orchestrator: Optional orchestrator instance to reuse instead of
                creating one lazily.
            delivery_repository: Preconstructed delivery repository to reuse.
            analytics_repository: Preconstructed analytics repository to reuse.
            recommendation_gpu_available: Explicit GPU availability flag override.

        Raises:
            ValueError: If ``db_session`` is ``None``.
            TypeError: If ``db_session`` is not a :class:`sqlmodel.Session` instance.

        """
        if db_session is None:
            raise ValueError(
                "ServiceContainerBuilder.build() requires an active database session. "
                "Pass a sqlmodel.Session instance when building the service container.",
            )
        if not isinstance(db_session, Session):
            raise TypeError(
                "ServiceContainerBuilder.build() expected a sqlmodel.Session instance, "
                f"got {type(db_session)!r}.",
            )

        queue = queue_orchestrator or self._get_queue_orchestrator()
        gpu_available = (
            recommendation_gpu_available
            if recommendation_gpu_available is not None
            else self.get_recommendation_gpu_available()
        )

        delivery_repository = (
            delivery_repository
            if delivery_repository is not None
            else self._delivery_repository_factory(db_session)
        )
        analytics_repository = (
            analytics_repository
            if analytics_repository is not None
            else self._analytics_repository_factory(db_session)
        )

        if delivery_repository is None:
            raise ValueError(
                "ServiceContainerBuilder.build() could not resolve a delivery "
                "repository. Ensure the delivery repository factory returns an "
                "instance.",
            )
        if analytics_repository is None:
            raise ValueError(
                "ServiceContainerBuilder.build() could not resolve an analytics "
                "repository. Ensure the analytics repository factory returns an "
                "instance.",
            )

        return ServiceRegistry(
            db_session,
            queue_orchestrator=queue,
            delivery_repository=delivery_repository,
            analytics_repository=analytics_repository,
            recommendation_gpu_available=gpu_available,
            factories=self._factories,
        )


__all__ = ["ServiceContainerBuilder"]
