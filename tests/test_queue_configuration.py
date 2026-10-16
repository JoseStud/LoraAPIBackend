"""Regression tests for shared queue backend configuration."""

from __future__ import annotations

import asyncio
import builtins
import json
import threading
import types
from unittest.mock import MagicMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from backend.core.config import settings
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.in_process_jobs import InProcessJobRunner
from backend.services.queue import (
    BackgroundTaskQueueBackend,
    QueueBackend,
    QueueOrchestrator,
    QueueUnavailableError,
    RedisQueueBackend,
    rq_job_id,
)
from backend.workers import tasks as worker_tasks
from backend.workers.tasks import reset_worker_context, set_worker_context


def _primary_error(caplog: pytest.LogCaptureFixture) -> dict:
    """Return the one ``queue_orchestrator.primary_error`` event logged."""
    events = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "backend.services.queue"
    ]
    errors = [e for e in events if e["event"] == "queue_orchestrator.primary_error"]
    assert len(errors) == 1, events
    return errors[0]


def test_queue_factory_shared_backend_with_redis(db_session) -> None:
    """API services and worker tasks should share the Redis queue backend."""
    original_url = settings.REDIS_URL
    orchestrator: QueueOrchestrator | None = None
    try:
        settings.REDIS_URL = "redis://localhost:6379/0"
        reset_worker_context()
        orchestrator = QueueOrchestrator(redis_url_factory=lambda: settings.REDIS_URL)
        orchestrator.reset()
        context = worker_tasks.build_worker_context(queue_orchestrator=orchestrator)
        set_worker_context(context)

        primary, fallback = orchestrator.get_backends()
        assert isinstance(primary, RedisQueueBackend)
        assert isinstance(fallback, BackgroundTaskQueueBackend)

        builder = get_service_container_builder()
        services = builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=DeliveryJobRepository(db_session),
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )
        deliveries_service = services.deliveries

        assert deliveries_service.queue_orchestrator is orchestrator
        assert context.queue_orchestrator is orchestrator
        assert context.primary_queue_backend is primary
        assert context.fallback_queue_backend is fallback
    finally:
        settings.REDIS_URL = original_url
        if orchestrator is not None:
            orchestrator.reset()
        reset_worker_context()


def test_queue_factory_shared_backend_without_redis(db_session) -> None:
    """Fallback queue should be shared when Redis is not configured."""
    original_url = settings.REDIS_URL
    orchestrator: QueueOrchestrator | None = None
    try:
        settings.REDIS_URL = None
        reset_worker_context()
        orchestrator = QueueOrchestrator(redis_url_factory=lambda: settings.REDIS_URL)
        orchestrator.reset()
        context = worker_tasks.build_worker_context(queue_orchestrator=orchestrator)
        set_worker_context(context)

        primary, fallback = orchestrator.get_backends()
        assert primary is None
        assert isinstance(fallback, BackgroundTaskQueueBackend)

        builder = get_service_container_builder()
        services = builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=DeliveryJobRepository(db_session),
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )
        deliveries_service = services.deliveries

        assert deliveries_service.queue_orchestrator is orchestrator
        assert context.queue_orchestrator is orchestrator
        assert context.primary_queue_backend is None
        assert context.queue_backend is fallback
        assert context.fallback_queue_backend is fallback
    finally:
        settings.REDIS_URL = original_url
        if orchestrator is not None:
            orchestrator.reset()
        reset_worker_context()


def test_redis_backend_recovers_from_connection_error(monkeypatch) -> None:
    """RedisQueueBackend should reset its queue when a connection error occurs."""
    backend = RedisQueueBackend("redis://localhost:6379/0")
    created_queues = []

    class FakeQueue:
        def __init__(self, idx: int) -> None:
            self.idx = idx
            self.enqueued: list[tuple[str, str, dict]] = []

        def enqueue(self, task_name: str, delivery_id: str, **kwargs):
            if self.idx == 0:
                raise RedisConnectionError("redis unavailable")
            self.enqueued.append((task_name, delivery_id, kwargs))
            return {"job_id": delivery_id}

    def fake_get_queue(self):  # pragma: no cover - exercised in test
        if self._queue is None:
            queue = FakeQueue(len(created_queues))
            created_queues.append(queue)
            self._queue = queue
        return self._queue

    monkeypatch.setattr(
        backend,
        "_get_queue",
        types.MethodType(fake_get_queue, backend),
    )

    result = backend.enqueue_delivery("job-1")

    assert len(created_queues) == 2
    assert backend._queue is created_queues[1]
    assert created_queues[1].enqueued[0][1] == "job-1"
    assert result == {"job_id": "job-1"}


def test_background_queue_awaits_coroutine_runner() -> None:
    """The fallback awaits a coroutine runner on the in-process job thread."""
    executed: list[tuple[str, str]] = []

    async def runner(job_id: str) -> None:
        await asyncio.sleep(0)
        executed.append((job_id, threading.current_thread().name))

    job_runner = InProcessJobRunner(thread_name="test-jobs")
    backend = BackgroundTaskQueueBackend(runner, job_runner=job_runner)
    try:
        backend.enqueue_delivery("job-2").result(timeout=5)
    finally:
        job_runner.stop()

    assert executed == [("job-2", "test-jobs")]


def test_background_queue_ignores_request_background_tasks() -> None:
    """Jobs never run as request background tasks, which could overlap."""
    executed: list[str] = []
    background_tasks = MagicMock()
    job_runner = InProcessJobRunner()
    backend = BackgroundTaskQueueBackend(executed.append, job_runner=job_runner)
    try:
        backend.enqueue_delivery("job-3", background_tasks=background_tasks).result(
            timeout=5
        )
    finally:
        job_runner.stop()

    assert executed == ["job-3"]
    background_tasks.add_task.assert_not_called()


def test_orchestrator_raises_when_primary_errors(caplog) -> None:
    """A failing primary queue is reported; the job never runs in-process."""
    executed: list[str] = []
    job_runner = InProcessJobRunner()
    fallback = BackgroundTaskQueueBackend(executed.append, job_runner=job_runner)
    primary = MagicMock(spec=QueueBackend)
    primary.enqueue_delivery.side_effect = RuntimeError("primary exploded")

    orchestrator = QueueOrchestrator(
        primary_backend=primary,
        fallback_backend=fallback,
    )

    try:
        with pytest.raises(QueueUnavailableError) as excinfo:
            orchestrator.enqueue_delivery("job-error")
    finally:
        job_runner.stop()

    error = _primary_error(caplog)

    assert executed == []
    assert isinstance(excinfo.value.__cause__, RuntimeError)
    assert error["error_type"] == "RuntimeError"
    assert error["error"] == "primary exploded"


def test_orchestrator_reports_missing_redis_dependency(caplog, monkeypatch) -> None:
    """With REDIS_URL set, missing Redis modules are an error, not a fallback."""
    executed: list[str] = []
    job_runner = InProcessJobRunner()
    fallback = BackgroundTaskQueueBackend(executed.append, job_runner=job_runner)
    orchestrator = QueueOrchestrator(
        fallback_backend=fallback,
        redis_url_factory=lambda: "redis://localhost:6379/0",
    )

    original_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "redis" or name.startswith("redis."):
            raise ModuleNotFoundError("No module named 'redis'")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    try:
        with pytest.raises(QueueUnavailableError):
            orchestrator.enqueue_delivery("job-missing-redis")
    finally:
        job_runner.stop()

    error = _primary_error(caplog)

    assert executed == []
    assert orchestrator.has_durable_queue()
    assert error["error_type"] == "RuntimeError"
    assert "optional 'redis' package" in error["error"]


def test_orchestrator_reports_redis_outage(caplog, monkeypatch) -> None:
    """A Redis outage is retried once by the backend, then reported."""
    executed: list[str] = []

    def record_job(job_id: str) -> None:
        executed.append(job_id)

    job_runner = InProcessJobRunner()
    fallback = BackgroundTaskQueueBackend(record_job, job_runner=job_runner)
    backend = RedisQueueBackend("redis://localhost:6379/0")

    attempts: list[tuple] = []

    class AlwaysFailQueue:
        def __init__(self) -> None:
            self.connection = None

        def enqueue(self, *args, **kwargs):
            attempts.append(args)
            raise RedisConnectionError("redis unavailable")

    def fake_get_queue(self):
        if self._queue is None:
            self._queue = AlwaysFailQueue()
        return self._queue

    monkeypatch.setattr(
        backend,
        "_get_queue",
        types.MethodType(fake_get_queue, backend),
    )

    orchestrator = QueueOrchestrator(
        primary_backend=backend,
        fallback_backend=fallback,
    )

    try:
        with pytest.raises(QueueUnavailableError):
            orchestrator.enqueue_delivery("job-redis-outage")
    finally:
        job_runner.stop()

    error = _primary_error(caplog)

    assert executed == []
    # The backend resets its connection and retries once before giving up.
    assert len(attempts) == 2
    assert error["error_type"] == RedisConnectionError.__name__
    assert error["error"] == "redis unavailable"


def test_redis_backend_applies_job_timeout(monkeypatch) -> None:
    """Jobs get the configured RQ timeout unless the caller sets one."""
    backend = RedisQueueBackend("redis://localhost:6379/0", job_timeout=900)
    queue = MagicMock()
    monkeypatch.setattr(backend, "_get_queue", lambda: queue)

    backend.enqueue_delivery("job-a")
    backend.enqueue_delivery("job-b", job_timeout=30)

    first, second = queue.enqueue.call_args_list
    assert first.kwargs["job_timeout"] == 900
    assert second.kwargs["job_timeout"] == 30


def test_redis_backend_uses_deterministic_job_id(monkeypatch) -> None:
    """Each delivery's RQ job id derives from the delivery id, whatever is passed."""
    backend = RedisQueueBackend("redis://localhost:6379/0")
    queue = MagicMock()
    monkeypatch.setattr(backend, "_get_queue", lambda: queue)

    backend.enqueue_delivery("job-a")

    (call,) = queue.enqueue.call_args_list
    assert call.args == (backend.task_name, "job-a")
    assert call.kwargs["job_id"] == rq_job_id("job-a") == "delivery-job-a"


def test_job_deadline_expires_before_rq_and_recovery_timeouts(monkeypatch) -> None:
    """In-loop deadline < RQ job timeout <= recovery's running timeout."""
    for timeout in (1, 2, 61, 270, 3600):
        monkeypatch.setattr(settings, "JOB_RUNNING_TIMEOUT_SECONDS", timeout)
        assert 0 < settings.job_deadline_seconds < settings.rq_job_timeout_seconds
        assert settings.rq_job_timeout_seconds <= settings.job_running_timeout_seconds
    monkeypatch.setattr(settings, "JOB_RUNNING_TIMEOUT_SECONDS", 600)
    assert settings.job_deadline_seconds == 600 - settings.JOB_DEADLINE_MARGIN_SECONDS


def test_redis_backend_applies_retry_policy(monkeypatch) -> None:
    """Jobs get the configured RQ retry policy unless the caller sets one."""
    backend = RedisQueueBackend(
        "redis://localhost:6379/0", max_retries=2, retry_intervals=[10, 20]
    )
    queue = MagicMock()
    monkeypatch.setattr(backend, "_get_queue", lambda: queue)

    backend.enqueue_delivery("job-a")
    backend.enqueue_delivery("job-b", retry=None)

    first, second = queue.enqueue.call_args_list
    retry = first.kwargs["retry"]
    assert (retry.max, retry.intervals) == (2, [10, 20])
    assert second.kwargs["retry"] is None


def test_redis_backend_without_retries(monkeypatch) -> None:
    """``max_retries=0`` enqueues jobs without a retry policy."""
    backend = RedisQueueBackend("redis://localhost:6379/0", max_retries=0)
    queue = MagicMock()
    monkeypatch.setattr(backend, "_get_queue", lambda: queue)

    backend.enqueue_delivery("job-a")

    assert queue.enqueue.call_args.kwargs["retry"] is None


def test_orchestrator_configures_retries_from_settings(monkeypatch) -> None:
    """The Redis backend takes its retry policy from the settings."""
    monkeypatch.setattr(settings, "DELIVERY_MAX_RETRIES", 3)
    monkeypatch.setattr(settings, "DELIVERY_RETRY_INTERVAL_SECONDS", 5)
    orchestrator = QueueOrchestrator(
        redis_url_factory=lambda: "redis://localhost:6379/0"
    )

    primary, _ = orchestrator.get_backends()

    assert isinstance(primary, RedisQueueBackend)
    assert primary.max_retries == 3
    assert primary.retry_intervals == [5, 10, 20]
    assert primary.job_timeout == settings.rq_job_timeout_seconds


def test_in_process_backend_ignores_retry_policy() -> None:
    """The in-process fallback runs a job once, whatever the caller asks."""
    attempts: list[str] = []

    def runner(job_id: str) -> None:
        attempts.append(job_id)
        raise ConnectionError("down")

    job_runner = InProcessJobRunner()
    backend = BackgroundTaskQueueBackend(runner, job_runner=job_runner)
    try:
        future = backend.enqueue_delivery("job-1", retry=object())
        assert isinstance(future.exception(timeout=5), ConnectionError)
        # A second job proves the first is not queued again.
        backend.enqueue_delivery("job-2").exception(timeout=5)
    finally:
        job_runner.stop()
    assert attempts == ["job-1", "job-2"]


def test_orchestrator_reports_durable_queue() -> None:
    """Only a primary (Redis) backend makes the queue durable."""
    in_process = QueueOrchestrator(
        fallback_backend=MagicMock(spec=QueueBackend), redis_url_factory=lambda: None
    )
    assert in_process.has_durable_queue() is False

    durable = QueueOrchestrator(primary_backend=MagicMock(spec=QueueBackend))
    assert durable.has_durable_queue() is True
