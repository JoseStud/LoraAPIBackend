"""Regression tests for shared queue backend configuration."""

from __future__ import annotations

import asyncio
import builtins
import types
from unittest.mock import MagicMock

from redis.exceptions import ConnectionError as RedisConnectionError

from backend.core.config import settings
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
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
        deliveries_service = services.application.deliveries

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
        deliveries_service = services.application.deliveries

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


def test_background_queue_schedules_coroutine(monkeypatch) -> None:
    """BackgroundTaskQueueBackend should schedule coroutines on the running loop."""
    scheduled = []

    async def runner(job_id: str):
        return job_id

    backend = BackgroundTaskQueueBackend(lambda job_id: runner(job_id))

    class DummyLoop:
        def create_task(self, coro):
            scheduled.append(coro)
            return object()

    monkeypatch.setattr(asyncio, "get_running_loop", lambda: DummyLoop())

    backend.enqueue_delivery("job-2")

    assert scheduled
    assert asyncio.iscoroutine(scheduled[0])
    scheduled[0].close()


def test_background_queue_runs_coroutine_without_loop(monkeypatch) -> None:
    """BackgroundTaskQueueBackend should fall back to anyio when no loop is active."""
    executed: list[str] = []

    async def runner(job_id: str):
        executed.append(job_id)

    backend = BackgroundTaskQueueBackend(lambda job_id: runner(job_id))

    def raise_no_loop():
        raise RuntimeError("no event loop")

    monkeypatch.setattr(asyncio, "get_running_loop", raise_no_loop)

    import anyio
    from anyio import from_thread

    def fail_portal(*args, **kwargs):
        raise RuntimeError("no portal")

    monkeypatch.setattr(from_thread, "run", fail_portal)
    monkeypatch.setattr(anyio, "run", lambda func, coro: asyncio.run(func(coro)))

    backend.enqueue_delivery("job-3")

    assert executed == ["job-3"]


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

    orchestrator.enqueue_delivery("job-error")

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

    orchestrator.enqueue_delivery("job-missing-redis")

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

    orchestrator.enqueue_delivery("job-redis-outage")

    out = capsys.readouterr().out

    assert executed == ["job-redis-outage"]
    assert "queue_orchestrator.fallback" in out
    assert "reason=primary_error" in out
    assert f"error_type={RedisConnectionError.__name__}" in out
    assert "redis unavailable" in out
