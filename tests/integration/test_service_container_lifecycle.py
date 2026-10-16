from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

import pytest
from fastapi import BackgroundTasks
from redis.exceptions import ConnectionError as RedisConnectionError

from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.in_process_jobs import InProcessJobRunner
from backend.services.queue import (
    BackgroundTaskQueueBackend,
    QueueBackend,
    QueueOrchestrator,
    QueueUnavailableError,
)
from backend.services.service_container_builder import ServiceContainerBuilder
from tests.util.in_process_jobs import drain_in_process_jobs
from tests.util.service_container import reset_service_container_builder


def _snapshot_registry(registry) -> Dict[str, Any]:
    """Return a simplified view of the dependency graph for assertions."""
    deliveries = registry.deliveries
    orchestrator = deliveries.queue_orchestrator
    primary, fallback = orchestrator.get_backends()
    return {
        "storage": type(registry.storage),
        "delivery_repository": type(deliveries.repository),
        "queue_primary": type(primary) if primary is not None else None,
        "queue_fallback": type(fallback),
        "system_service": type(registry.system),
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
        orchestrators.append(registry.deliveries.queue_orchestrator)

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

    assert override_registry_a.deliveries.queue_orchestrator is sentinel_orchestrator
    assert override_registry_b.deliveries.queue_orchestrator is sentinel_orchestrator
    assert override_builder.get_recommendation_gpu_available() is True
    assert base_builder.get_recommendation_gpu_available() is False

    base_registry = base_builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        delivery_repository=DeliveryJobRepository(db_session),
    )

    assert base_registry.deliveries.queue_orchestrator is not sentinel_orchestrator


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


def test_redis_errors_never_reach_the_fallback_across_resets(db_session) -> None:
    """Redis errors are reported, not run in-process, before and after a reset."""
    scheduled_jobs: list[str] = []
    job_runner = InProcessJobRunner()

    def orchestrator_factory() -> QueueOrchestrator:
        call_log: list[str] = []
        orchestrator = QueueOrchestrator(
            primary_backend=_FailingRedisBackend(call_log),
            fallback_backend=BackgroundTaskQueueBackend(
                lambda job_id: scheduled_jobs.append(job_id),
                job_runner=job_runner,
            ),
        )
        orchestrator._test_call_log = call_log  # type: ignore[attr-defined]
        return orchestrator

    builder = ServiceContainerBuilder(
        queue_orchestrator_factory=orchestrator_factory,
        recommendation_gpu_detector=lambda: False,
    )

    try:
        registry_one = builder.build(
            db_session,
            analytics_repository=AnalyticsRepository(db_session),
            delivery_repository=DeliveryJobRepository(db_session),
        )
        deliveries_one = registry_one.deliveries
        background_tasks_one = BackgroundTasks()
        with pytest.raises(QueueUnavailableError):
            deliveries_one.enqueue_job("job-1", background_tasks=background_tasks_one)

        orchestrator_one = deliveries_one.queue_orchestrator
        assert orchestrator_one._test_call_log == ["job-1"]
        assert background_tasks_one.tasks == []

        # Reset caches to simulate an application reload.
        reset_service_container_builder(builder)

        registry_two = builder.build(
            db_session,
            analytics_repository=AnalyticsRepository(db_session),
            delivery_repository=DeliveryJobRepository(db_session),
        )
        deliveries_two = registry_two.deliveries
        orchestrator_two = deliveries_two.queue_orchestrator

        assert orchestrator_two is not orchestrator_one
        assert orchestrator_two._test_call_log == []

        with pytest.raises(QueueUnavailableError):
            deliveries_two.enqueue_job("job-2", background_tasks=BackgroundTasks())
        assert orchestrator_two._test_call_log == ["job-2"]

        drain_in_process_jobs(job_runner)
        assert scheduled_jobs == []
    finally:
        job_runner.stop()
