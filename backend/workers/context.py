"""Shared context and helpers for worker processes and tasks."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Optional, TypeVar

from sqlmodel import Session

from backend.delivery import (
    ensure_delivery_system,
    get_delivery_registry,
    run_with_fresh_loop,
)
from backend.services import (
    DeliveryService,
    ServiceRegistry,
    get_service_container_builder,
)
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import (
    QueueBackend,
    QueueOrchestrator,
    RedisQueueBackend,
    create_queue_orchestrator,
)
from backend.services.recommendations import EmbeddingService
from backend.workers.delivery_runner import DeliveryRunner

T = TypeVar("T")
AsyncRunner = Callable[[Coroutine[Any, Any, T]], T]


def _default_async_runner(coro: Coroutine[Any, Any, T]) -> T:
    """Execute a coroutine to completion on a fresh event loop.

    The loop's delivery HTTP sessions are closed before it ends.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return run_with_fresh_loop(coro)
    raise RuntimeError(
        "An event loop is already running; provide a custom async_runner to the "
        "WorkerContext to schedule background work.",
    )


@dataclass
class WorkerContext:
    """Aggregate shared worker dependencies in a single object."""

    queue_backend: QueueBackend
    fallback_queue_backend: QueueBackend
    primary_queue_backend: Optional[RedisQueueBackend]
    queue_orchestrator: QueueOrchestrator
    delivery_runner: DeliveryRunner
    recommendation_gpu_available: bool
    _async_runner: AsyncRunner

    def __init__(
        self,
        *,
        queue_orchestrator: QueueOrchestrator,
        delivery_runner: Optional[DeliveryRunner] = None,
        recommendation_gpu_available: Optional[bool] = None,
        async_runner: Optional[AsyncRunner] = None,
    ) -> None:
        """Capture queue, runner, and scheduling helpers for worker tasks."""
        primary, fallback = queue_orchestrator.get_backends()
        queue_backend = primary or fallback
        if queue_backend is None:  # pragma: no cover - defensive guard
            raise RuntimeError("No queue backend available")

        self.queue_backend = queue_backend
        self.fallback_queue_backend = fallback
        self.primary_queue_backend = (
            primary if isinstance(primary, RedisQueueBackend) else None
        )
        self.queue_orchestrator = queue_orchestrator
        self.delivery_runner = delivery_runner or DeliveryRunner(
            get_delivery_registry(),
            delivery_service_factory=self._build_delivery_service,
        )
        self.recommendation_gpu_available = (
            recommendation_gpu_available
            if recommendation_gpu_available is not None
            else EmbeddingService.is_gpu_available()
        )
        self._async_runner = async_runner or _default_async_runner

    @classmethod
    def build_default(
        cls,
        *,
        queue_orchestrator: Optional[QueueOrchestrator] = None,
        async_runner: Optional[AsyncRunner] = None,
        recommendation_gpu_available: Optional[bool] = None,
    ) -> "WorkerContext":
        """Create a context using the shared queue backend factory.

        Registers the built-in delivery backends first, so a worker process
        starts with the same registry the API process sets up in its lifespan.
        """
        ensure_delivery_system()
        return cls(
            queue_orchestrator=queue_orchestrator or create_queue_orchestrator(),
            recommendation_gpu_available=recommendation_gpu_available,
            async_runner=async_runner,
        )

    def run_async(self, coro: Coroutine[Any, Any, T]) -> T:
        """Execute ``coro`` using the configured asynchronous runner."""
        return self._async_runner(coro)

    @property
    def rq_queue(self):
        """Return the underlying RQ queue when Redis is configured."""
        if isinstance(self.queue_backend, RedisQueueBackend):
            try:
                return self.queue_backend.queue
            except Exception:  # pragma: no cover - defensive fallback
                return None
        return None

    def _build_delivery_service(self, db_session: Session) -> DeliveryService:
        """Return the delivery service from this context's service container."""
        return self.create_service_container(db_session).deliveries

    def create_service_container(self, db_session: Session) -> ServiceRegistry:
        """Instantiate a service container sharing this context's dependencies."""
        if db_session is None:  # Defensive guard for callers bypassing type hints
            raise ValueError(
                "WorkerContext.create_service_container() requires an active database "
                "session to construct repositories.",
            )

        delivery_repository = DeliveryJobRepository(db_session)
        analytics_repository = AnalyticsRepository(db_session)

        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=self.queue_orchestrator,
            delivery_repository=delivery_repository,
            analytics_repository=analytics_repository,
            recommendation_gpu_available=self.recommendation_gpu_available,
        )
