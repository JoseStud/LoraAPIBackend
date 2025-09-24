"""Queue backend abstractions for delivery job scheduling."""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import Any, Callable, Optional, Tuple, Type

from fastapi import BackgroundTasks

from backend.core.config import settings
from backend.delivery.base import delivery_registry
from backend.workers.delivery_runner import DeliveryRunner

PrimaryFallbackQueues = Tuple[Optional["QueueBackend"], "QueueBackend"]


class QueueBackend(ABC):
    """Abstract interface for enqueuing delivery jobs."""

    @abstractmethod
    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> Any:
        """Enqueue a delivery job for processing."""


class RedisQueueBackend(QueueBackend):
    """Redis-backed queue implementation using RQ."""

    def __init__(
        self,
        redis_url: str,
        queue_name: str = "default",
        task_name: str = "backend.workers.tasks.process_delivery",
    ) -> None:
        self.redis_url = redis_url
        self.queue_name = queue_name
        self.task_name = task_name
        self._queue = None

    def _get_queue(self):
        if self._queue is None:
            from redis import Redis
            from rq import Queue

            redis_conn = Redis.from_url(self.redis_url)
            self._queue = Queue(self.queue_name, connection=redis_conn)
        return self._queue

    def _reset_queue(self) -> None:
        """Clear the cached queue reference and close its connection if needed."""
        if self._queue is not None:
            connection = getattr(self._queue, "connection", None)
            close = getattr(connection, "close", None)
            if callable(close):  # pragma: no cover - defensive guard
                try:
                    close()
                except Exception:
                    # Closing a broken connection should never surface to callers.
                    pass
        self._queue = None

    def reset(self) -> None:
        """Public helper to reset the cached Redis queue instance."""
        self._reset_queue()

    def _is_connection_error(self, exc: Exception) -> bool:
        """Return ``True`` when ``exc`` represents a Redis connection failure."""

        error_types: list[Type[BaseException]] = []
        try:  # pragma: no cover - import guarded for optional dependency
            from redis.exceptions import RedisError
        except Exception:  # pragma: no cover - optional dependency guard
            RedisError = None
        else:
            error_types.append(RedisError)

        try:  # pragma: no cover - optional dependency guard
            from rq.exceptions import NoRedisConnectionError
        except Exception:  # pragma: no cover
            NoRedisConnectionError = None
        else:
            error_types.append(NoRedisConnectionError)

        if not error_types:
            return False

        error_tuple = tuple(error_types)
        if isinstance(exc, error_tuple):
            return True
        if exc.__cause__ is not None and isinstance(exc.__cause__, error_tuple):
            return True
        return False

    @property
    def queue(self):
        """Expose the underlying RQ queue instance."""
        return self._get_queue()

    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> Any:
        queue = self._get_queue()
        try:
            return queue.enqueue(self.task_name, job_id, **enqueue_kwargs)
        except Exception as exc:
            if not self._is_connection_error(exc):
                raise

            # Reset the cached queue and retry once to transparently recover
            # from Redis restarts or transient network failures.
            self._reset_queue()
            queue = self._get_queue()
            return queue.enqueue(self.task_name, job_id, **enqueue_kwargs)


class BackgroundTaskQueueBackend(QueueBackend):
    """Queue implementation that executes jobs in-process via BackgroundTasks."""

    def __init__(self, runner: Callable[[str], Any]) -> None:
        self._runner = runner

    @staticmethod
    async def _consume_coroutine(coro):
        return await coro

    def _execute(self, job_id: str) -> None:
        result = self._runner(job_id)
        if asyncio.iscoroutine(result):
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                try:
                    from anyio import from_thread

                    from_thread.run(self._consume_coroutine, result)
                    return
                except RuntimeError:
                    import anyio

                    anyio.run(self._consume_coroutine, result)
                    return
            loop.create_task(result)

    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> None:
        if background_tasks is not None:
            background_tasks.add_task(self._execute, job_id)
        else:
            self._execute(job_id)


class QueueOrchestrator:
    """Coordinate selection and usage of queue backends."""

    def __init__(
        self,
        *,
        primary_backend: Optional[QueueBackend] = None,
        fallback_backend: Optional[QueueBackend] = None,
        redis_url_factory: Callable[[], Optional[str]] = lambda: settings.REDIS_URL,
        delivery_runner_factory: Optional[Callable[[], DeliveryRunner]] = None,
    ) -> None:
        self._initial_primary = primary_backend
        self._initial_fallback = fallback_backend
        self._primary_backend = primary_backend
        self._fallback_backend = fallback_backend
        self._redis_url_factory = redis_url_factory
        self._delivery_runner_factory = delivery_runner_factory or (
            lambda: DeliveryRunner(delivery_registry)
        )
        self._delivery_runner: Optional[DeliveryRunner] = None

    def get_backends(self) -> PrimaryFallbackQueues:
        """Return the configured primary and fallback queue backends."""
        primary = self._ensure_primary_backend()
        fallback = self._ensure_fallback_backend()

        if fallback is None:  # pragma: no cover - defensive guard
            raise RuntimeError("Fallback queue backend could not be initialized")

        return primary, fallback

    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> Any:
        """Enqueue ``job_id`` using the configured queue strategy."""
        primary, fallback = self.get_backends()

        last_error: Optional[Exception] = None
        if primary is not None:
            try:
                return primary.enqueue_delivery(
                    job_id,
                    background_tasks=background_tasks,
                    **enqueue_kwargs,
                )
            except Exception as exc:  # pragma: no cover - defensive branch
                last_error = exc

        try:
            return fallback.enqueue_delivery(
                job_id,
                background_tasks=background_tasks,
                **enqueue_kwargs,
            )
        except Exception as fallback_exc:
            if last_error is not None:
                raise last_error from fallback_exc
            raise

    def get_delivery_runner(self) -> DeliveryRunner:
        """Return (and lazily construct) the DeliveryRunner used by the fallback."""
        if self._delivery_runner is None:
            self._delivery_runner = self._delivery_runner_factory()
        return self._delivery_runner

    def reset(self) -> None:
        """Reset cached queue instances (used primarily by tests)."""
        if isinstance(self._primary_backend, RedisQueueBackend):
            self._primary_backend.reset()
        self._primary_backend = self._initial_primary
        self._fallback_backend = self._initial_fallback
        self._delivery_runner = None

    def _ensure_primary_backend(self) -> Optional[QueueBackend]:
        if self._primary_backend is not None:
            return self._primary_backend

        redis_url = self._redis_url_factory()
        if redis_url:
            self._primary_backend = RedisQueueBackend(redis_url)

        return self._primary_backend

    def _ensure_fallback_backend(self) -> Optional[QueueBackend]:
        if self._fallback_backend is not None:
            return self._fallback_backend

        runner = self.get_delivery_runner()
        self._fallback_backend = BackgroundTaskQueueBackend(
            runner.process_delivery_job,
        )
        return self._fallback_backend


def create_queue_orchestrator(
    *,
    redis_url_factory: Callable[[], Optional[str]] = lambda: settings.REDIS_URL,
    delivery_runner_factory: Optional[Callable[[], DeliveryRunner]] = None,
) -> QueueOrchestrator:
    """Factory helper that builds the default :class:`QueueOrchestrator`."""
    return QueueOrchestrator(
        redis_url_factory=redis_url_factory,
        delivery_runner_factory=delivery_runner_factory,
    )

