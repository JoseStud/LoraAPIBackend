"""Queue backend abstractions for delivery job scheduling."""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import Any, Callable, Optional, Tuple

from fastapi import BackgroundTasks

from backend.core.config import settings

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
        return queue.enqueue(self.task_name, job_id, **enqueue_kwargs)


class BackgroundTaskQueueBackend(QueueBackend):
    """Queue implementation that executes jobs in-process via BackgroundTasks."""

    def __init__(self, runner: Callable[[str], Any]) -> None:
        self._runner = runner

    def _execute(self, job_id: str) -> None:
        result = self._runner(job_id)
        if asyncio.iscoroutine(result):
            asyncio.run(result)

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


_primary_queue_backend: Optional["QueueBackend"] = None
_fallback_queue_backend: Optional["QueueBackend"] = None


def _build_primary_queue_backend() -> Optional["QueueBackend"]:
    redis_url = settings.REDIS_URL
    if redis_url:
        return RedisQueueBackend(redis_url)
    return None


def _build_fallback_queue_backend() -> "QueueBackend":
    from backend.services.deliveries import process_delivery_job

    return BackgroundTaskQueueBackend(process_delivery_job)


def get_queue_backends() -> PrimaryFallbackQueues:
    """Return the lazily instantiated primary and fallback queue backends."""

    global _primary_queue_backend, _fallback_queue_backend

    if _primary_queue_backend is None:
        _primary_queue_backend = _build_primary_queue_backend()

    if _fallback_queue_backend is None:
        _fallback_queue_backend = _build_fallback_queue_backend()

    if _fallback_queue_backend is None:  # pragma: no cover - safety net
        raise RuntimeError("Fallback queue backend could not be initialized")

    return _primary_queue_backend, _fallback_queue_backend


def reset_queue_backends() -> None:
    """Reset cached queue backend instances (primarily for tests)."""

    global _primary_queue_backend, _fallback_queue_backend
    _primary_queue_backend = None
    _fallback_queue_backend = None
