from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

from fastapi import BackgroundTasks
from redis.exceptions import ConnectionError as RedisConnectionError

from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import (
    BackgroundTaskQueueBackend,
    QueueBackend,
    QueueOrchestrator,
)
from backend.services.service_container_builder import ServiceContainerBuilder
from tests.util.service_container import reset_service_container_builder


def _snapshot_registry(registry) -> Dict[str, Any]:
    """Return a simplified view of the dependency graph for assertions."""
    deliveries = registry.application.deliveries
    orchestrator = deliveries.queue_orchestrator
    primary, fallback = orchestrator.get_backends()
    return {
        "storage": type(registry.core.storage),
        "delivery_repository": type(deliveries.repository),
        "queue_primary": type(primary) if primary is not None else None,
        "queue_fallback": type(fallback),
        "system_service": type(registry.application.system),
    }


def _assert_all_distinct(objects: Iterable[object]) -> None:
    seen: set[int] = set()
    for obj in objects:
        identifier = id(obj)
        assert identifier not in seen
        seen.add(identifier)


def test_service_container_repeated_startup_is_deterministic(db_session) -> None:
    """Repeated builds should yield structurally identical dependency graphs."""
    builder = get_service_container_builder()

    snapshots: list[Dict[str, Any]] = []
    orchestrators = []
    for _ in range(3):
        reset_service_container_builder(builder)
        registry = builder.build(
            db_session,
            analytics_repository=AnalyticsRepository(db_session),
            delivery_repository=DeliveryJobRepository(db_session),
            recommendation_gpu_available=False,
        )
        snapshots.append(_snapshot_registry(registry))
        orchestrators.append(registry.application.deliveries.queue_orchestrator)

    assert snapshots and snapshots.count(snapshots[0]) == len(snapshots)
    _assert_all_distinct(orchestrators)


def test_service_container_overrides_do_not_leak_state(db_session) -> None:
    """Builders created via ``with_overrides`` should remain isolated."""
    base_builder = ServiceContainerBuilder(
        recommendation_gpu_detector=lambda: False,
    )

    sentinel_orchestrator = QueueOrchestrator(
        fallback_backend=BackgroundTaskQueueBackend(lambda _: None),
    )

    override_builder = base_builder.with_overrides(
        queue_orchestrator_factory=lambda: sentinel_orchestrator,
        recommendation_gpu_detector=lambda: True,
    )

    override_registry_a = override_builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        delivery_repository=DeliveryJobRepository(db_session),
    )
    override_registry_b = override_builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        delivery_repository=DeliveryJobRepository(db_session),
    )

    assert override_registry_a.application.deliveries.queue_orchestrator is sentinel_orchestrator
    assert override_registry_b.application.deliveries.queue_orchestrator is sentinel_orchestrator
    assert override_builder.get_recommendation_gpu_available() is True
    assert base_builder.get_recommendation_gpu_available() is False

    base_registry = base_builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        delivery_repository=DeliveryJobRepository(db_session),
    )

    assert base_registry.application.deliveries.queue_orchestrator is not sentinel_orchestrator


@dataclass
class _FailingRedisBackend(QueueBackend):
    call_log: list[str]

    def enqueue_delivery(
        self,
        job_id: str,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> None:
        self.call_log.append(job_id)
        raise RedisConnectionError("redis connection lost")


def _run_background_tasks(tasks: Iterable[Any]) -> None:
    async def runner() -> None:
        for task in tasks:
            await task()

    asyncio.run(runner())


def test_queue_fallback_recovers_from_redis_errors(db_session) -> None:
    """Queue orchestrator should fallback asynchronously and survive resets."""
    scheduled_jobs: list[str] = []

    def orchestrator_factory() -> QueueOrchestrator:
        call_log: list[str] = []
        orchestrator = QueueOrchestrator(
            primary_backend=_FailingRedisBackend(call_log),
            fallback_backend=BackgroundTaskQueueBackend(
                lambda job_id: scheduled_jobs.append(job_id)
            ),
        )
        orchestrator._test_call_log = call_log  # type: ignore[attr-defined]
        return orchestrator

    builder = ServiceContainerBuilder(
        queue_orchestrator_factory=orchestrator_factory,
        recommendation_gpu_detector=lambda: False,
    )

    # First build - primary fails and fallback schedules work.
    registry_one = builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        delivery_repository=DeliveryJobRepository(db_session),
    )
    deliveries_one = registry_one.application.deliveries
    background_tasks_one = BackgroundTasks()
    deliveries_one.enqueue_job("job-1", background_tasks=background_tasks_one)

    orchestrator_one = deliveries_one.queue_orchestrator
    call_log_one = orchestrator_one._test_call_log
    assert call_log_one == ["job-1"]
    assert len(background_tasks_one.tasks) == 1
    _run_background_tasks(background_tasks_one.tasks)
    assert scheduled_jobs == ["job-1"]

    # Reset caches to simulate an application reload.
    reset_service_container_builder(builder)

    registry_two = builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        delivery_repository=DeliveryJobRepository(db_session),
    )
    deliveries_two = registry_two.application.deliveries
    orchestrator_two = deliveries_two.queue_orchestrator

    assert orchestrator_two is not orchestrator_one
    call_log_two = orchestrator_two._test_call_log
    assert call_log_two == []

    background_tasks_two = BackgroundTasks()
    deliveries_two.enqueue_job("job-2", background_tasks=background_tasks_two)
    assert call_log_two == ["job-2"]
    assert len(background_tasks_two.tasks) == 1
    _run_background_tasks(background_tasks_two.tasks)
    assert scheduled_jobs == ["job-1", "job-2"]
