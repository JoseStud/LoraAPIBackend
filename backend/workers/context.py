"""Shared context and helpers for worker processes and tasks."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Optional, TypeVar

from sqlmodel import Session

from backend.delivery.base import delivery_registry
from backend.services import ServiceContainer
from backend.services.queue import QueueBackend, RedisQueueBackend, get_queue_backends
from backend.services.recommendations import RecommendationService
from backend.workers.delivery_runner import DeliveryRunner

T = TypeVar("T")
AsyncRunner = Callable[[Coroutine[Any, Any, T]], T]


def _default_async_runner(coro: Coroutine[Any, Any, T]) -> T:
    """Execute a coroutine to completion using ``asyncio.run``."""

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
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
    delivery_runner: DeliveryRunner
    recommendation_gpu_available: bool
    _async_runner: AsyncRunner

    def __init__(
        self,
        *,
        queue_backend: QueueBackend,
        fallback_queue_backend: QueueBackend,
        primary_queue_backend: Optional[RedisQueueBackend] = None,
        delivery_runner: Optional[DeliveryRunner] = None,
        recommendation_gpu_available: Optional[bool] = None,
        async_runner: Optional[AsyncRunner] = None,
    ) -> None:
        self.queue_backend = queue_backend
        self.fallback_queue_backend = fallback_queue_backend
        self.primary_queue_backend = primary_queue_backend
        self.delivery_runner = delivery_runner or DeliveryRunner(delivery_registry)
        self.recommendation_gpu_available = (
            recommendation_gpu_available
            if recommendation_gpu_available is not None
            else RecommendationService.is_gpu_available()
        )
        self._async_runner = async_runner or _default_async_runner

    @classmethod
    def build_default(
        cls,
        *,
        async_runner: Optional[AsyncRunner] = None,
        recommendation_gpu_available: Optional[bool] = None,
    ) -> "WorkerContext":
        """Create a context using the shared queue backend factory."""

        primary, fallback = get_queue_backends()

        queue_backend = primary or fallback
        if queue_backend is None:  # pragma: no cover - defensive guard
            raise RuntimeError("No queue backend is available for worker context")

        return cls(
            queue_backend=queue_backend,
            fallback_queue_backend=fallback,
            primary_queue_backend=primary if isinstance(primary, RedisQueueBackend) else None,
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

    def create_service_container(self, db_session: Optional[Session]) -> ServiceContainer:
        """Instantiate a service container sharing this context's dependencies."""

        return ServiceContainer(
            db_session,
            queue_backend=self.queue_backend,
            fallback_queue_backend=self.fallback_queue_backend,
            recommendation_gpu_available=self.recommendation_gpu_available,
        )

