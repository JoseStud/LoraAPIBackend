"""Tests targeting CLI-oriented delivery flows and queue orchestration."""

import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app.main import backend_app
from backend.core.dependencies import get_services
from backend.models import DeliveryJob
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.deliveries import QUEUE_UNAVAILABLE_RESULT
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import QueueOrchestrator
from backend.services.websocket import websocket_service
from tests.api.conftest import FailingQueueBackend, RecordingQueueBackend


def _assert_single_failed_job(db_session) -> None:
    """The job the queue rejected exists and is failed, so it is not left pending."""
    db_session.expire_all()
    jobs = db_session.exec(select(DeliveryJob)).all()
    assert [job.status for job in jobs] == ["failed"]
    assert json.loads(jobs[0].result) == QUEUE_UNAVAILABLE_RESULT.to_payload()


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

    backend_app.dependency_overrides[get_services] = override_service_container
    try:
        response = client.post(
            "/api/v1/compose",
            json={"prefix": "p", "delivery": {"mode": "cli", "cli": {}}},
        )
    finally:
        backend_app.dependency_overrides.pop(get_services, None)

    assert response.status_code == 200
    body = response.json()
    assert body.get("warnings") == []
    assert body["delivery"]["id"]

    assert len(recording_queue_backend.calls) == 1
    call = recording_queue_backend.calls[0]
    assert call["job_id"] == body["delivery"]["id"]
    assert call["background_tasks"] is not None


def test_compose_reports_unavailable_queue(
    client: TestClient,
    db_session,
    create_active_adapter,
    failing_queue_backend: FailingQueueBackend,
    recording_queue_backend: RecordingQueueBackend,
):
    """A failing primary queue gives a 503 and a failed job, never in-process work."""
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

    backend_app.dependency_overrides[get_services] = override_service_container
    try:
        response = client.post(
            "/api/v1/compose",
            json={"prefix": "p", "delivery": {"mode": "cli", "cli": {}}},
        )
    finally:
        backend_app.dependency_overrides.pop(get_services, None)

    assert response.status_code == 503
    assert response.json()["title"] == "Job queue unavailable"
    assert "primary queue failed" not in response.text

    assert failing_queue_backend.attempts == 1
    assert recording_queue_backend.calls == []
    _assert_single_failed_job(db_session)


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

    broadcast_mock = AsyncMock()
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

    backend_app.dependency_overrides[get_services] = override_service_container
    try:
        response = client.post(
            "/api/v1/generation/queue-generation",
            json={"prompt": "Track primary"},
        )
    finally:
        backend_app.dependency_overrides.pop(get_services, None)

    assert response.status_code == 200
    payload = response.json()
    job_id = payload["delivery_id"]

    assert len(primary_queue.calls) == 1
    assert primary_queue.calls[0]["job_id"] == job_id
    assert primary_queue.calls[0]["background_tasks"] is not None
    assert fallback_queue.calls == []

    # generation_started is sent by the job monitor once a runner claims the
    # job, not by the request that queued it.
    broadcast_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_queue_generation_job_reports_unavailable_queue(
    client: TestClient,
    db_session,
    failing_queue_backend: FailingQueueBackend,
    recording_queue_backend: RecordingQueueBackend,
    monkeypatch: pytest.MonkeyPatch,
):
    """A failing primary queue gives a 503 and a failed job."""
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(
        websocket_service.manager,
        "broadcast_generation_started",
        broadcast_mock,
    )

    def override_service_container():
        orchestrator = QueueOrchestrator(
            primary_backend=failing_queue_backend,
            fallback_backend=recording_queue_backend,
        )
        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=orchestrator,
            delivery_repository=DeliveryJobRepository(db_session),
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )

    backend_app.dependency_overrides[get_services] = override_service_container
    try:
        response = client.post(
            "/api/v1/generation/queue-generation",
            json={"prompt": "Queue is down"},
        )
    finally:
        backend_app.dependency_overrides.pop(get_services, None)

    assert response.status_code == 503
    assert response.json()["title"] == "Job queue unavailable"
    assert "primary queue failed" not in response.text

    assert failing_queue_backend.attempts == 1
    assert recording_queue_backend.calls == []
    _assert_single_failed_job(db_session)
    broadcast_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_queue_generation_job_stores_client_ref(
    client: TestClient,
    db_session,
):
    """``client_ref`` is kept with the job so the finished webhook can echo it."""
    queue = RecordingQueueBackend()

    def override_service_container():
        builder = get_service_container_builder()
        return builder.build(
            db_session,
            queue_orchestrator=QueueOrchestrator(primary_backend=queue),
            delivery_repository=DeliveryJobRepository(db_session),
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )

    backend_app.dependency_overrides[get_services] = override_service_container
    try:
        response = client.post(
            "/api/v1/generation/queue-generation",
            params={"client_ref": "n8n-form"},
            json={"prompt": "Tagged job"},
        )
        too_long = client.post(
            "/api/v1/generation/queue-generation",
            params={"client_ref": "x" * 201},
            json={"prompt": "Tagged job"},
        )
    finally:
        backend_app.dependency_overrides.pop(get_services, None)

    assert response.status_code == 200
    job_id = response.json()["delivery_id"]
    repository = DeliveryJobRepository(db_session)
    job = repository.get_job(job_id)
    assert repository.get_job_params(job).client_ref == "n8n-form"
    assert too_long.status_code == 422
