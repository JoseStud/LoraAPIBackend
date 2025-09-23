"""Tests targeting CLI-oriented delivery flows and queue orchestration."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from backend.core.dependencies import get_service_container
from backend.main import app as backend_app
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import QueueOrchestrator
from backend.services.websocket import websocket_service

from tests.api.conftest import FailingQueueBackend, RecordingQueueBackend


def test_compose_uses_primary_queue_backend(
    client: TestClient,
    db_session,
    create_active_adapter,
    recording_queue_backend: RecordingQueueBackend,
):
    """Compose should enqueue via the configured primary queue backend."""
    create_active_adapter(client)

    def override_service_container():
        orchestrator = QueueOrchestrator(primary_backend=recording_queue_backend)
        repository = DeliveryJobRepository(db_session)
        analytics_repository = AnalyticsRepository(db_session)
        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=repository,
            analytics_repository=analytics_repository,
            recommendation_gpu_available=False,
        )

    backend_app.dependency_overrides[get_service_container] = override_service_container
    try:
        response = client.post(
            "/api/v1/compose",
            json={"prefix": "p", "delivery": {"mode": "cli", "cli": {}}},
        )
    finally:
        backend_app.dependency_overrides.pop(get_service_container, None)

    assert response.status_code == 200
    body = response.json()
    assert body.get("warnings") == []
    assert body["delivery"]["id"]

    assert len(recording_queue_backend.calls) == 1
    call = recording_queue_backend.calls[0]
    assert call["job_id"] == body["delivery"]["id"]
    assert call["background_tasks"] is not None


def test_compose_falls_back_to_background_queue(
    client: TestClient,
    db_session,
    create_active_adapter,
    failing_queue_backend: FailingQueueBackend,
    recording_queue_backend: RecordingQueueBackend,
):
    """Compose should fall back when the primary queue raises."""
    create_active_adapter(client)

    def override_service_container():
        orchestrator = QueueOrchestrator(
            primary_backend=failing_queue_backend,
            fallback_backend=recording_queue_backend,
        )
        repository = DeliveryJobRepository(db_session)
        analytics_repository = AnalyticsRepository(db_session)
        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=repository,
            analytics_repository=analytics_repository,
            recommendation_gpu_available=False,
        )

    backend_app.dependency_overrides[get_service_container] = override_service_container
    try:
        response = client.post(
            "/api/v1/compose",
            json={"prefix": "p", "delivery": {"mode": "cli", "cli": {}}},
        )
    finally:
        backend_app.dependency_overrides.pop(get_service_container, None)

    assert response.status_code == 200
    body = response.json()
    assert body.get("warnings") == []
    assert body["delivery"]["id"]

    assert failing_queue_backend.attempts == 1
    assert len(recording_queue_backend.calls) == 1
    call = recording_queue_backend.calls[0]
    assert call["job_id"] == body["delivery"]["id"]
    assert call["background_tasks"] is not None


@pytest.mark.anyio
async def test_queue_generation_job_uses_primary_queue_backend(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    """Queue endpoint enqueues jobs via the configured primary queue backend."""

    class TrackingQueue(RecordingQueueBackend):
        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
            super().enqueue_delivery(
                job_id,
                background_tasks=background_tasks,
                **enqueue_kwargs,
            )
            return job_id

    primary_queue = TrackingQueue()
    fallback_queue = TrackingQueue()

    start_mock = AsyncMock()
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(websocket_service, "start_job_monitoring", start_mock)
    monkeypatch.setattr(
        websocket_service.manager,
        "broadcast_generation_started",
        broadcast_mock,
    )

    def override_service_container():
        orchestrator = QueueOrchestrator(
            primary_backend=primary_queue,
            fallback_backend=fallback_queue,
        )
        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=DeliveryJobRepository(db_session),
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )

    backend_app.dependency_overrides[get_service_container] = override_service_container
    try:
        response = client.post(
            "/api/v1/generation/queue-generation",
            json={"prompt": "Track primary"},
        )
    finally:
        backend_app.dependency_overrides.pop(get_service_container, None)

    assert response.status_code == 200
    payload = response.json()
    job_id = payload["delivery_id"]

    assert len(primary_queue.calls) == 1
    assert primary_queue.calls[0]["job_id"] == job_id
    assert primary_queue.calls[0]["background_tasks"] is not None
    assert fallback_queue.calls == []

    start_mock.assert_awaited_once()
    start_args, start_kwargs = start_mock.await_args
    assert start_args[0] == job_id
    assert start_kwargs == {}

    broadcast_mock.assert_awaited_once()
    broadcast_args, broadcast_kwargs = broadcast_mock.await_args
    assert broadcast_args[0] == job_id
    assert broadcast_kwargs == {}


@pytest.mark.anyio
async def test_queue_generation_job_falls_back_to_background_tasks(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    """Queue endpoint uses the in-process fallback when the primary queue fails."""

    class FailingQueue(FailingQueueBackend):
        def __init__(self) -> None:
            super().__init__()
            self.calls = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
            self.calls.append(
                {
                    "job_id": job_id,
                    "background_tasks": background_tasks,
                    "enqueue_kwargs": enqueue_kwargs,
                }
            )
            super().enqueue_delivery(
                job_id,
                background_tasks=background_tasks,
                **enqueue_kwargs,
            )

    class InstrumentedBackgroundQueue(RecordingQueueBackend):
        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
            super().enqueue_delivery(
                job_id,
                background_tasks=background_tasks,
                **enqueue_kwargs,
            )
            if background_tasks is not None:
                background_tasks.add_task(lambda job=job_id: None)
            return job_id

    primary_queue = FailingQueue()
    fallback_queue = InstrumentedBackgroundQueue()

    start_mock = AsyncMock()
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(websocket_service, "start_job_monitoring", start_mock)
    monkeypatch.setattr(
        websocket_service.manager,
        "broadcast_generation_started",
        broadcast_mock,
    )

    def override_service_container():
        orchestrator = QueueOrchestrator(
            primary_backend=primary_queue,
            fallback_backend=fallback_queue,
        )
        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=DeliveryJobRepository(db_session),
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )

    backend_app.dependency_overrides[get_service_container] = override_service_container
    try:
        response = client.post(
            "/api/v1/generation/queue-generation",
            json={"prompt": "Track fallback"},
        )
    finally:
        backend_app.dependency_overrides.pop(get_service_container, None)

    assert response.status_code == 200
    payload = response.json()
    job_id = payload["delivery_id"]

    assert len(primary_queue.calls) == 1
    assert primary_queue.calls[0]["job_id"] == job_id
    assert len(fallback_queue.calls) == 1
    assert fallback_queue.calls[0]["job_id"] == job_id

    background_tasks = fallback_queue.calls[0]["background_tasks"]
    assert background_tasks is not None
    assert getattr(background_tasks, "tasks", [])

    start_mock.assert_awaited_once()
    start_args, start_kwargs = start_mock.await_args
    assert start_args[0] == job_id
    assert start_kwargs == {}

    broadcast_mock.assert_awaited_once()
    broadcast_args, broadcast_kwargs = broadcast_mock.await_args
    assert broadcast_args[0] == job_id
    assert broadcast_kwargs == {}
