"""Tests covering generation job orchestration."""

from contextlib import contextmanager
from dataclasses import replace
from types import SimpleNamespace
from typing import Any, Dict
from unittest.mock import MagicMock

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from backend.core.dependencies import get_service_container
from backend.delivery.base import DeliveryRegistry, GenerationBackend
from backend.main import app as backend_app
from backend.schemas import SDNextGenerationParams, SDNextGenerationResult
from backend.services import get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.queue import (
    QueueBackend,
    QueueOrchestrator,
    create_queue_orchestrator,
)
from backend.services.websocket import WebSocketService
from backend.workers.delivery_runner import DeliveryRunner


def test_cancel_generation_job_succeeds(
    client: TestClient,
    delivery_service: DeliveryService,
    monkeypatch: pytest.MonkeyPatch,
    generation_params_factory,
):
    """Cancelling an active job updates status and stops monitoring."""
    params = generation_params_factory("Prompt")
    job = delivery_service.create_job("Prompt", "sdnext", params)
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
    generation_params_factory,
):
    """Cancelling a completed job returns an error."""
    params = generation_params_factory("Prompt")
    job = delivery_service.create_job("Prompt", "sdnext", params)
    delivery_service.update_job_status(
        job.id,
        "succeeded",
        {"status": "completed"},
    )

    response = client.post(f"/api/v1/generation/jobs/{job.id}/cancel")
    assert response.status_code == 400


def test_serialize_generation_job_normalizes_payload(
    delivery_service: DeliveryService,
    generation_params_factory,
):
    """Helper returns flattened params and normalized result details."""
    params = generation_params_factory("Prompt")
    job = delivery_service.create_job("Prompt", "sdnext", params)
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
    assert serialized["params"]["backend"] == "sdnext"
    assert serialized["progress"] == 50.0
    assert serialized["message"] == "Working"
    assert serialized["error"] == "Minor issue"
    assert serialized["result"]["progress"] == 0.5


def test_generation_coordinator_schedule_generation_job(db_session):
    """Coordinator schedules jobs and forwards enqueue kwargs."""

    class RecordingQueue(QueueBackend):
        def __init__(self) -> None:
            self.calls = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
            self.calls.append((job_id, background_tasks, enqueue_kwargs))

    queue = RecordingQueue()
    repository = DeliveryJobRepository(db_session)
    orchestrator = QueueOrchestrator(primary_backend=queue)
    deliveries = DeliveryService(repository, queue_orchestrator=orchestrator)
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
    assert job.mode == "custom"

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


def test_delivery_runner_uses_requested_generation_backend(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    """Processing a job triggers the generation backend specified when scheduling."""

    class SilentQueue(QueueBackend):
        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
            return job_id

    class RecordingGenerationBackend(GenerationBackend):
        def __init__(self, name: str) -> None:
            self.name = name
            self.calls = []

        async def generate_image(
            self, prompt: str, params: Dict[str, Any]
        ) -> SDNextGenerationResult:
            self.calls.append((prompt, params))
            return SDNextGenerationResult(job_id="generated", status="completed")

        async def check_progress(self, job_id: str) -> SDNextGenerationResult:
            return SDNextGenerationResult(job_id=job_id, status="completed")

        def is_available(self) -> bool:
            return True

    queue = SilentQueue()
    repository = DeliveryJobRepository(db_session)
    orchestrator = QueueOrchestrator(primary_backend=queue)
    deliveries = DeliveryService(repository, queue_orchestrator=orchestrator)
    coordinator = GenerationCoordinator(
        deliveries,
        WebSocketService(),
        GenerationService(),
    )

    params = SDNextGenerationParams(prompt="Custom backend test")
    job = coordinator.schedule_generation_job(params, backend="custom-backend")

    registry = DeliveryRegistry()
    custom_backend = RecordingGenerationBackend("custom-backend")
    default_backend = RecordingGenerationBackend("sdnext")
    registry.register_generation_backend("custom-backend", custom_backend)
    registry.register_generation_backend("sdnext", default_backend)

    runner = DeliveryRunner(registry)

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(
        "backend.core.database.get_session_context",
        lambda: session_context(),
    )

    runner.process_delivery_job(job.id)

    assert len(custom_backend.calls) == 1
    assert custom_backend.calls[0][0] == "Custom backend test"
    called_params = custom_backend.calls[0][1]
    assert called_params["backend"] == "custom-backend"
    assert default_backend.calls == []

    db_session.expire_all()
    refreshed = deliveries.get_job(job.id)
    assert refreshed is not None
    assert refreshed.status == "succeeded"


def test_compose_sdnext_uses_generation_coordinator(
    client: TestClient,
    db_session,
):
    """Compose endpoint delegates SDNext deliveries to the coordinator."""

    class RecordingCoordinator:
        def __init__(self) -> None:
            self.calls = []
            self.broadcast_calls = []

        def schedule_generation_job(self, generation_params, **kwargs):
            self.calls.append((generation_params, kwargs))
            return SimpleNamespace(id="job-123", status="pending")

        async def broadcast_job_started(self, job_id, params):
            self.broadcast_calls.append((job_id, params))

    coordinator = RecordingCoordinator()
    builder = get_service_container_builder().with_overrides(
        infrastructure=lambda factories: replace(
            factories,
            generation_coordinator=lambda deliveries,
            websocket,
            generation: coordinator,
        ),
    )
    services = builder.build(
        db_session,
        queue_orchestrator=create_queue_orchestrator(),
        delivery_repository=DeliveryJobRepository(db_session),
        analytics_repository=AnalyticsRepository(db_session),
        recommendation_gpu_available=False,
    )

    backend_app.dependency_overrides[get_service_container] = lambda: services

    try:
        response = client.post(
            "/api/v1/compose",
            json={
                "prefix": "pref",
                "delivery": {
                    "mode": "sdnext",
                    "sdnext": {
                        "generation_params": {"prompt": "seed"},
                        "mode": "deferred",
                        "save_images": False,
                        "return_format": "url",
                    },
                },
            },
        )
    finally:
        backend_app.dependency_overrides.pop(get_service_container, None)

    assert response.status_code == 200
    body = response.json()

    assert coordinator.calls
    generation_params, call_kwargs = coordinator.calls[0]
    assert generation_params.prompt == body["prompt"]
    assert call_kwargs["backend"] == "sdnext"
    assert call_kwargs["mode"] == "deferred"
    assert call_kwargs["save_images"] is False
    assert call_kwargs["return_format"] == "url"
    assert call_kwargs["background_tasks"] is not None

    delivery_info = body.get("delivery")
    assert delivery_info == {"id": "job-123", "status": "pending"}

    assert coordinator.broadcast_calls
    broadcast_job_id, broadcast_params = coordinator.broadcast_calls[0]
    assert broadcast_job_id == "job-123"
    assert broadcast_params.prompt == body["prompt"]
