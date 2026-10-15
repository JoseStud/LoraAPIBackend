"""Queue backend abstractions for delivery job scheduling."""

from __future__ import annotations

from abc import ABC, abstractmethod
from concurrent.futures import Future
from typing import Any, Callable, List, Optional, Protocol, Sequence, Tuple, Type

import structlog

from backend.core.config import settings
from backend.delivery import get_delivery_registry
from backend.services.in_process_jobs import (
    InProcessJobRunner,
    get_in_process_job_runner,
)
from backend.workers.delivery_runner import DeliveryRunner

logger = structlog.get_logger(__name__)

PrimaryFallbackQueues = Tuple[Optional["QueueBackend"], "QueueBackend"]


class TaskScheduler(Protocol):
    """Anything that can run a callable after the current request completes.

    FastAPI's ``BackgroundTasks`` satisfies this structurally, so routers keep
    passing it while services stay independent of the web framework.
    """

    def add_task(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        """Schedule ``func(*args, **kwargs)`` to run later."""


class QueueBackend(ABC):
    """Abstract interface for enqueuing delivery jobs."""

    @abstractmethod
    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[TaskScheduler] = None,
        **enqueue_kwargs: Any,
    ) -> Any:
        """Enqueue a delivery job for processing."""


class RedisQueueBackend(QueueBackend):
    """Redis-backed queue implementation using RQ.

    Jobs are retried by RQ when the task raises, ``max_retries`` times. Each
    attempt reads its remaining retries from the RQ job and the runner marks
    the delivery ``retrying`` (or ``failed`` on the last attempt), so the next
    attempt can claim it again. A retry of a job that was cancelled meanwhile,
    or that a timed-out attempt left ``running``, cannot claim it and does
    nothing.
    """

    def __init__(
        self,
        redis_url: str,
        queue_name: str = "default",
        task_name: str = "backend.workers.tasks.process_delivery",
        job_timeout: Optional[int] = None,
        max_retries: int = 0,
        retry_intervals: Optional[Sequence[int]] = None,
    ) -> None:
        """Initialise the Redis queue backend.

        Args:
            redis_url: Connection URL used to talk to Redis.
            queue_name: Name of the queue to enqueue delivery jobs into.
            task_name: Fully qualified task path executed by workers.
            job_timeout: Seconds RQ lets a job run before killing it; ``None``
                keeps RQ's default.
            max_retries: How often RQ retries a job whose task raised; 0
                disables retries.
            retry_intervals: Seconds to wait before each retry; RQ reuses the
                first one when there are fewer intervals than retries. Delays
                above 0 need a worker started with ``--with-scheduler``.

        """
        if max_retries < 0:
            raise ValueError("max_retries must not be negative")
        self.redis_url = redis_url
        self.queue_name = queue_name
        self.task_name = task_name
        self.job_timeout = job_timeout
        self.max_retries = max_retries
        self.retry_intervals: List[int] = list(retry_intervals or [])
        self._queue = None

    def _get_queue(self):
        if self._queue is None:
            Redis, Queue = self._import_dependencies()

            redis_conn = Redis.from_url(self.redis_url)
            self._queue = Queue(self.queue_name, connection=redis_conn)
        return self._queue

    def _import_dependencies(self) -> Tuple[Any, Any]:
        try:
            from redis import Redis
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Redis queue backend requires the optional 'redis' package. "
                "Install redis and rq (e.g. `pip install redis rq`) or disable the "
                "Redis queue by clearing REDIS_URL.",
            ) from exc

        try:
            from rq import Queue
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Redis queue backend requires the optional 'rq' package. "
                "Install redis and rq (e.g. `pip install redis rq`) or disable the "
                "Redis queue by clearing REDIS_URL.",
            ) from exc

        return Redis, Queue

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

    def _build_retry(self) -> Any:
        """Return the RQ ``Retry`` policy for new jobs, or ``None`` for none."""
        if self.max_retries <= 0:
            return None
        try:
            from rq import Retry
        except ModuleNotFoundError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "Redis queue backend requires the optional 'rq' package.",
            ) from exc
        return Retry(max=self.max_retries, interval=self.retry_intervals or 0)

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
        background_tasks: Optional[TaskScheduler] = None,
        **enqueue_kwargs: Any,
    ) -> Any:
        """Enqueue ``job_id`` on the configured Redis queue.

        The backend's job timeout and retry policy apply unless the caller
        passes ``job_timeout`` or ``retry`` (``retry=None`` disables retries).
        """
        if self.job_timeout is not None:
            enqueue_kwargs.setdefault("job_timeout", self.job_timeout)
        if "retry" not in enqueue_kwargs:
            enqueue_kwargs["retry"] = self._build_retry()
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
    """Queue implementation that runs jobs in this process, one at a time.

    Jobs go to the process-wide :class:`InProcessJobRunner`, which runs them
    in order on its own thread and event loop, so in-process jobs never
    overlap on SDNext and every request and recovery pass shares one queue.
    Each job runs once: there is no retry, so a job whose runner raises is
    marked ``failed``.
    """

    def __init__(
        self,
        runner: Callable[[str], Any],
        *,
        job_runner: Optional[InProcessJobRunner] = None,
    ) -> None:
        """Create a background task queue backend.

        Args:
            runner: Callable invoked with the delivery job identifier on the
                job runner's event loop; an awaitable it returns is awaited.
            job_runner: Runner that executes the jobs; defaults to the
                process-wide one.

        """
        self._runner = runner
        self._job_runner = job_runner

    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[TaskScheduler] = None,
        **enqueue_kwargs: Any,
    ) -> "Future[None]":
        """Queue ``job_id`` behind the in-process jobs already queued.

        ``background_tasks`` is accepted for the :class:`QueueBackend`
        protocol but not used: request-scoped tasks would let jobs overlap.
        The returned future completes when the job has run.
        """
        job_runner = self._job_runner or get_in_process_job_runner()
        return job_runner.submit(self._runner, job_id)


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
        """Initialise the orchestrator with optional backends and factories."""
        self._initial_primary = primary_backend
        self._initial_fallback = fallback_backend
        self._primary_backend = primary_backend
        self._fallback_backend = fallback_backend
        self._redis_url_factory = redis_url_factory
        self._delivery_runner_factory = delivery_runner_factory or (
            lambda: DeliveryRunner(get_delivery_registry())
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
        background_tasks: Optional[TaskScheduler] = None,
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
                logger.warning(
                    "queue_orchestrator.fallback",  # structured log key
                    job_id=job_id,
                    reason="primary_error",
                    primary_backend=type(primary).__name__,
                    fallback_backend=type(fallback).__name__,
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
        else:
            logger.warning(
                "queue_orchestrator.fallback",
                job_id=job_id,
                reason="primary_unavailable",
                primary_backend=None,
                fallback_backend=type(fallback).__name__,
            )

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

    def has_durable_queue(self) -> bool:
        """Return whether jobs go to a queue that outlives this process.

        Without one, jobs run in-process and a restart loses every job that
        was waiting or running.
        """
        return self._ensure_primary_backend() is not None

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
            self._primary_backend = RedisQueueBackend(
                redis_url,
                job_timeout=settings.job_running_timeout_seconds,
                max_retries=settings.DELIVERY_MAX_RETRIES,
                retry_intervals=settings.delivery_retry_intervals,
            )

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
    """Build the default :class:`QueueOrchestrator`."""
    return QueueOrchestrator(
        redis_url_factory=redis_url_factory,
        delivery_runner_factory=delivery_runner_factory,
    )
