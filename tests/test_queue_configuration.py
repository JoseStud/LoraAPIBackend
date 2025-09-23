"""Regression tests for shared queue backend configuration."""

from __future__ import annotations

from backend.core.config import settings
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import (
    BackgroundTaskQueueBackend,
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
