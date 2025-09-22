"""Tests for generation job management endpoints."""

from __future__ import annotations

from typing import Dict, cast

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from backend.main import app as backend_app
from backend.services import ServiceContainer
from backend.services.deliveries import DeliveryService
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.queue import QueueBackend
from backend.services.websocket import WebSocketService
from backend.schemas import SDNextGenerationParams


def _create_generation_params(prompt: str) -> Dict[str, Dict[str, object]]:
    return {
        "generation_params": {
            "prompt": prompt,
            "negative_prompt": "nope",
            "width": 640,
            "height": 480,
            "steps": 25,
            "cfg_scale": 7.5,
            "seed": 1234,
        }
    }


def test_list_active_generation_jobs_returns_running_and_pending(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Active jobs endpoint returns pending and running jobs only."""

    pending = delivery_service.create_job("Prompt A", "sdnext", _create_generation_params("Prompt A"))
    running = delivery_service.create_job("Prompt B", "sdnext", _create_generation_params("Prompt B"))
    delivery_service.update_job_status(running.id, "running")

    completed = delivery_service.create_job("Prompt C", "sdnext", _create_generation_params("Prompt C"))
    delivery_service.update_job_status(completed.id, "succeeded", {"status": "completed"})

    response = client.get("/api/v1/generation/jobs/active")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload, list)
    identifiers = {item["id"] for item in payload}
    assert identifiers == {pending.id, running.id}

    for job in payload:
        assert job["status"] in {"pending", "running"}
        assert job["jobId"] == job["id"]
        assert job["params"]["prompt"] in {"Prompt A", "Prompt B"}
        assert "startTime" in job and job["startTime"] is not None


def test_list_active_generation_jobs_empty_when_none(client: TestClient):
    """Endpoint returns an empty list when no jobs exist."""

    response = client.get("/api/v1/generation/jobs/active")
    assert response.status_code == 200
    assert response.json() == []


def test_cancel_generation_job_succeeds(
    client: TestClient,
    delivery_service: DeliveryService,
    monkeypatch: pytest.MonkeyPatch,
):
    """Cancelling an active job updates status and stops monitoring."""

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    delivery_service.update_job_status(job.id, "running")

    stop_mock = MagicMock()
    monkeypatch.setattr(
        "backend.services.websocket.websocket_service.stop_job_monitoring",
        stop_mock,
    )

    response = client.post(f"/api/v1/generation/jobs/{job.id}/cancel")
    assert response.status_code == 200

    payload = response.json()
    assert payload["success"] is True
    assert payload["status"] == "cancelled"

    updated = delivery_service.get_job(job.id)
    assert updated is not None and updated.status == "cancelled"
    stop_mock.assert_called_once_with(job.id)


def test_cancel_generation_job_not_found(client: TestClient):
    """Cancelling a nonexistent job returns 404."""

    response = client.post("/api/v1/generation/jobs/unknown/cancel")
    assert response.status_code == 404


def test_cancel_generation_job_invalid_state(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Cancelling a completed job returns an error."""

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    delivery_service.update_job_status(job.id, "succeeded", {"status": "completed"})

    response = client.post(f"/api/v1/generation/jobs/{job.id}/cancel")
    assert response.status_code == 400


def test_list_generation_results_returns_recent_jobs(
    client: TestClient,
    db_session,
):
    """Completed jobs are returned from the results endpoint respecting limit."""

    services = ServiceContainer(db_session)
    delivery_service = services.deliveries

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    result_payload = {
        "status": "completed",
        "images": ["data:image/png;base64,abc123"],
        "generation_info": {"duration": 1.23},
    }
    delivery_service.update_job_status(job.id, "succeeded", result_payload)

    response = client.get("/api/v1/generation/results", params={"limit": 5})
    assert response.status_code == 200

    results = response.json()
    assert len(results) == 1
    entry = results[0]
    assert entry["id"] == job.id
    assert entry["job_id"] == job.id
    assert entry["prompt"] == "Prompt"
    assert entry["image_url"] == "data:image/png;base64,abc123"
    assert entry["status"] == "succeeded"
    assert entry["width"] == 640
    assert entry["height"] == 480
    assert entry["steps"] == 25
    assert entry["cfg_scale"] == 7.5
    assert entry["seed"] == 1234


def test_serialize_generation_job_normalizes_payload(delivery_service: DeliveryService):
    """Helper returns flattened params and normalized result details."""

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    delivery_service.update_job_status(
        job.id,
        "running",
        {
            "progress": 0.5,
            "detail": "Working",
            "error_message": "Minor issue",
        },
    )

    coordinator = GenerationCoordinator(
        delivery_service,
        WebSocketService(),
        GenerationService(),
    )

    serialized = coordinator.serialize_delivery_job(job)

    assert serialized["params"]["prompt"] == "Prompt"
    assert serialized["progress"] == 50.0
    assert serialized["message"] == "Working"
    assert serialized["error"] == "Minor issue"
    assert serialized["result"]["progress"] == 0.5


def test_generation_coordinator_schedule_generation_job(db_session):
    """Coordinator schedules jobs and forwards enqueue kwargs."""

    class RecordingQueue(QueueBackend):
        def __init__(self) -> None:
            self.calls = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):  # type: ignore[override]
            self.calls.append((job_id, background_tasks, enqueue_kwargs))

    queue = RecordingQueue()
    deliveries = DeliveryService(db_session, queue_backend=queue)
    coordinator = GenerationCoordinator(
        deliveries,
        WebSocketService(),
        GenerationService(),
    )

    params = SDNextGenerationParams(prompt="Prompt")
    background_tasks = BackgroundTasks()

    job = coordinator.schedule_generation_job(
        params,
        backend="custom",
        mode="deferred",
        save_images=False,
        return_format="url",
        background_tasks=background_tasks,
        priority="high",
    )

    assert job.prompt == "Prompt"

    assert len(queue.calls) == 1
    call_job_id, call_background, call_kwargs = queue.calls[0]
    assert call_job_id == job.id
    assert call_background is background_tasks
    assert call_kwargs["priority"] == "high"

    stored_params = deliveries.get_job_params(job)
    assert stored_params["generation_params"]["prompt"] == "Prompt"
    assert stored_params["backend"] == "custom"
    assert stored_params["mode"] == "deferred"
    assert stored_params["save_images"] is False
    assert stored_params["return_format"] == "url"


@pytest.mark.anyio
async def test_generation_coordinator_broadcast_job_started(monkeypatch: pytest.MonkeyPatch):
    """Coordinator triggers WebSocket monitoring and broadcasts."""

    deliveries = cast(DeliveryService, MagicMock(spec=DeliveryService))
    websocket = WebSocketService()
    coordinator = GenerationCoordinator(
        deliveries,
        websocket,
        GenerationService(),
    )

    start_mock = AsyncMock()
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(websocket, "start_job_monitoring", start_mock)
    monkeypatch.setattr(websocket.manager, "broadcast_generation_started", broadcast_mock)

    params = SDNextGenerationParams(prompt="Prompt")

    await coordinator.broadcast_job_started("job-1", params)

    start_mock.assert_awaited_once()
    awaited_job_id, awaited_service = start_mock.await_args.args
    assert awaited_job_id == "job-1"
    assert isinstance(awaited_service, GenerationService)

    broadcast_mock.assert_awaited_once()
    broadcast_args = broadcast_mock.await_args.args
    assert broadcast_args[0] == "job-1"
    assert broadcast_args[1].job_id == "job-1"
    assert broadcast_args[1].params.prompt == "Prompt"


def test_queue_generation_job_uses_primary_queue_backend(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    """Queue endpoint enqueues jobs via the configured primary queue backend."""

    class TrackingQueue(QueueBackend):
        def __init__(self) -> None:
            self.calls = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):  # type: ignore[override]
            self.calls.append((job_id, background_tasks, enqueue_kwargs))

    primary_queue = TrackingQueue()
    fallback_queue = TrackingQueue()

    start_mock = AsyncMock()
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(
        "backend.services.websocket.websocket_service.start_job_monitoring",
        start_mock,
    )
    monkeypatch.setattr(
        "backend.services.websocket.websocket_service.manager.broadcast_generation_started",
        broadcast_mock,
    )

    from backend.core.dependencies import get_service_container

    def override_service_container():
        return ServiceContainer(
            db_session,
            queue_backend=primary_queue,
            fallback_queue_backend=fallback_queue,
        )

    backend_app.dependency_overrides[get_service_container] = override_service_container

    response = client.post(
        "/api/v1/generation/queue-generation",
        json={"prompt": "Track primary"},
    )

    assert response.status_code == 200
    payload = response.json()
    job_id = payload["delivery_id"]

    assert len(primary_queue.calls) == 1
    assert primary_queue.calls[0][0] == job_id
    assert primary_queue.calls[0][1] is not None
    assert fallback_queue.calls == []

    start_mock.assert_awaited_once()
    start_args, start_kwargs = start_mock.await_args
    assert start_args[0] == job_id
    assert start_kwargs == {}

    broadcast_mock.assert_awaited_once()
    broadcast_args, broadcast_kwargs = broadcast_mock.await_args
    assert broadcast_args[0] == job_id
    assert broadcast_kwargs == {}


def test_queue_generation_job_falls_back_to_background_tasks(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    """Queue endpoint uses the in-process fallback when the primary queue fails."""

    class FailingQueue(QueueBackend):
        def __init__(self) -> None:
            self.calls = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):  # type: ignore[override]
            self.calls.append((job_id, background_tasks, enqueue_kwargs))
            raise RuntimeError("primary failure")

    class InstrumentedBackgroundQueue(QueueBackend):
        def __init__(self) -> None:
            self.calls = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):  # type: ignore[override]
            self.calls.append((job_id, background_tasks, enqueue_kwargs))
            if background_tasks is not None:
                background_tasks.add_task(lambda job=job_id: None)

    primary_queue = FailingQueue()
    fallback_queue = InstrumentedBackgroundQueue()

    start_mock = AsyncMock()
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(
        "backend.services.websocket.websocket_service.start_job_monitoring",
        start_mock,
    )
    monkeypatch.setattr(
        "backend.services.websocket.websocket_service.manager.broadcast_generation_started",
        broadcast_mock,
    )

    from backend.core.dependencies import get_service_container

    def override_service_container():
        return ServiceContainer(
            db_session,
            queue_backend=primary_queue,
            fallback_queue_backend=fallback_queue,
        )

    backend_app.dependency_overrides[get_service_container] = override_service_container

    response = client.post(
        "/api/v1/generation/queue-generation",
        json={"prompt": "Track fallback"},
    )

    assert response.status_code == 200
    payload = response.json()
    job_id = payload["delivery_id"]

    assert len(primary_queue.calls) == 1
    assert primary_queue.calls[0][0] == job_id
    assert len(fallback_queue.calls) == 1
    assert fallback_queue.calls[0][0] == job_id

    background_tasks = fallback_queue.calls[0][1]
    assert background_tasks is not None
    assert getattr(background_tasks, "tasks", [])  # background task scheduled

    start_mock.assert_awaited_once()
    start_args, start_kwargs = start_mock.await_args
    assert start_args[0] == job_id
    assert start_kwargs == {}

    broadcast_mock.assert_awaited_once()
    broadcast_args, broadcast_kwargs = broadcast_mock.await_args
    assert broadcast_args[0] == job_id
    assert broadcast_kwargs == {}


