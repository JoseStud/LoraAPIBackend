"""Regression tests for shared queue backend configuration."""

from __future__ import annotations

import asyncio
import builtins
import threading
import types
from unittest.mock import MagicMock

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
    RedisQueueBackend,
)
from backend.workers import tasks as worker_tasks
from backend.workers.tasks import reset_worker_context, set_worker_context


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

        def enqueue(self, task_name: str, job_id: str, **kwargs):
            if self.idx == 0:
                raise RedisConnectionError("redis unavailable")
            self.enqueued.append((task_name, job_id, kwargs))
            return {"job_id": job_id}

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


def test_orchestrator_logs_warning_when_primary_errors(capsys) -> None:
    """Fallback queue usage should emit a warning with the original error."""
    executed: list[str] = []

    def record_job(job_id: str) -> None:
        executed.append(job_id)

    fallback = BackgroundTaskQueueBackend(record_job)
    primary = MagicMock(spec=QueueBackend)
    primary.enqueue_delivery.side_effect = RuntimeError("primary exploded")

    orchestrator = QueueOrchestrator(
        primary_backend=primary,
        fallback_backend=fallback,
    )

    orchestrator.enqueue_delivery("job-error").result(timeout=5)

    out = capsys.readouterr().out

    assert executed == ["job-error"]
    assert "queue_orchestrator.fallback" in out
    assert "reason=primary_error" in out
    assert "error_type=RuntimeError" in out
    assert "primary exploded" in out


def test_orchestrator_reports_missing_redis_dependency(capsys, monkeypatch) -> None:
    """Missing optional Redis modules should trigger a guided fallback warning."""
    executed: list[str] = []

    def record_job(job_id: str) -> None:
        executed.append(job_id)

    fallback = BackgroundTaskQueueBackend(record_job)
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

    orchestrator.enqueue_delivery("job-missing-redis").result(timeout=5)

    out = capsys.readouterr().out

    assert executed == ["job-missing-redis"]
    assert "queue_orchestrator.fallback" in out
    assert "reason=primary_error" in out
    assert "error_type=RuntimeError" in out
    assert "optional 'redis' package" in out


def test_orchestrator_logs_redis_outage_warning(capsys, monkeypatch) -> None:
    """Redis outages should fall back with actionable diagnostics."""
    executed: list[str] = []

    def record_job(job_id: str) -> None:
        executed.append(job_id)

    fallback = BackgroundTaskQueueBackend(record_job)
    backend = RedisQueueBackend("redis://localhost:6379/0")

    class AlwaysFailQueue:
        def __init__(self) -> None:
            self.connection = None

        def enqueue(self, *args, **kwargs):
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

    orchestrator.enqueue_delivery("job-redis-outage").result(timeout=5)

    out = capsys.readouterr().out

    assert executed == ["job-redis-outage"]
    assert "queue_orchestrator.fallback" in out
    assert "reason=primary_error" in out
    assert f"error_type={RedisConnectionError.__name__}" in out
    assert "redis unavailable" in out


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


def test_orchestrator_reports_durable_queue() -> None:
    """Only a primary (Redis) backend makes the queue durable."""
    in_process = QueueOrchestrator(
        fallback_backend=MagicMock(spec=QueueBackend), redis_url_factory=lambda: None
    )
    assert in_process.has_durable_queue() is False

    durable = QueueOrchestrator(primary_backend=MagicMock(spec=QueueBackend))
    assert durable.has_durable_queue() is True
