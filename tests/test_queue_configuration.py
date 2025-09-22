"""Regression tests for shared queue backend configuration."""

from __future__ import annotations

from backend.core.config import settings
from backend.services import ServiceContainer
from backend.services.queue import (
    BackgroundTaskQueueBackend,
    RedisQueueBackend,
    get_queue_backends,
    reset_queue_backends,
)
from backend.workers import tasks as worker_tasks


def _restore_queue_state(original_url: str | None) -> None:
    """Restore settings and queue backends to their original state."""

    settings.REDIS_URL = original_url
    reset_queue_backends()
    worker_tasks.initialize_queue_backends()


def test_queue_factory_shared_backend_with_redis(db_session) -> None:
    """API services and worker tasks should share the Redis queue backend."""

    original_url = settings.REDIS_URL
    reset_queue_backends()
    try:
        settings.REDIS_URL = "redis://localhost:6379/0"
        worker_tasks.initialize_queue_backends()

        primary, fallback = get_queue_backends()
        assert isinstance(primary, RedisQueueBackend)
        assert isinstance(fallback, BackgroundTaskQueueBackend)

        container = ServiceContainer(db_session)
        deliveries_service = container.deliveries

        assert deliveries_service._queue_backend is primary
        assert deliveries_service._fallback_queue_backend is fallback
        assert worker_tasks.queue_backend is primary
        assert worker_tasks.fallback_queue_backend is fallback
    finally:
        _restore_queue_state(original_url)


def test_queue_factory_shared_backend_without_redis(db_session) -> None:
    """Fallback queue should be shared when Redis is not configured."""

    original_url = settings.REDIS_URL
    reset_queue_backends()
    try:
        settings.REDIS_URL = None
        worker_tasks.initialize_queue_backends()

        primary, fallback = get_queue_backends()
        assert primary is None
        assert isinstance(fallback, BackgroundTaskQueueBackend)

        container = ServiceContainer(db_session)
        deliveries_service = container.deliveries

        assert deliveries_service._queue_backend is None
        assert deliveries_service._fallback_queue_backend is fallback
        assert worker_tasks.primary_queue_backend is None
        assert worker_tasks.queue_backend is fallback
        assert worker_tasks.fallback_queue_backend is fallback
        assert worker_tasks.q is None
    finally:
        _restore_queue_state(original_url)
