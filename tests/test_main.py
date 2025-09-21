"""Tests for the HTTP API, using FastAPI's TestClient and pytest fixtures."""
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.core.dependencies import get_service_container
from backend.main import app as backend_app
from backend.schemas import SDNextGenerationResult
from backend.services import ServiceContainer
from backend.services.queue import QueueBackend


class RecordingQueueBackend(QueueBackend):
    """Queue backend that records enqueue calls for assertions."""

    def __init__(self) -> None:
        self.calls = []

    def enqueue_delivery(self, job_id: str, *, background_tasks=None, **enqueue_kwargs):
        self.calls.append(
            {
                "job_id": job_id,
                "background_tasks": background_tasks,
                "enqueue_kwargs": enqueue_kwargs,
            }
        )


class FailingQueueBackend(QueueBackend):
    """Queue backend that always raises to force fallback usage."""

    def __init__(self) -> None:
        self.attempts = 0

    def enqueue_delivery(self, job_id: str, *, background_tasks=None, **enqueue_kwargs):
        self.attempts += 1
        raise RuntimeError("primary queue failed")


def _create_active_adapter(client: TestClient, mock_storage: MagicMock) -> None:
    """Helper to create and activate a test adapter."""

    mock_storage.exists.return_value = True
    import uuid

    name = "test-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    response = client.post("/api/v1/adapters", json=data)
    assert response.status_code == 201
    adapter_id = response.json()["adapter"]["id"]

    activate_response = client.post(f"/api/v1/adapters/{adapter_id}/activate")
    assert activate_response.status_code == 200

    return adapter_id


def test_health(client: TestClient):
    """Health endpoint returns ok."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_frontend_settings_endpoint(client: TestClient):
    """Frontend settings endpoint exposes runtime configuration."""
    response = client.get("/frontend/settings")
    assert response.status_code == 200
    payload = response.json()
    assert "backendUrl" in payload
    assert payload["backendUrl"].endswith("/v1")


def test_adapter_lifecycle(client: TestClient, mock_storage: MagicMock):
    """Full adapter lifecycle: create, read, activate, compose, deactivate."""
    mock_storage.exists.return_value = True
    import uuid

    name = "t1-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "tags": ["a"],
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    r = client.post("/api/v1/adapters", json=data)
    assert r.status_code == 201
    adapter = r.json()["adapter"]
    aid = adapter["id"]

    r = client.get(f"/api/v1/adapters/{aid}")
    assert r.status_code == 200

    r = client.post(f"/api/v1/adapters/{aid}/activate")
    assert r.status_code == 200
    assert r.json()["adapter"]["active"] is True

    r = client.post("/api/v1/compose", json={"prefix": "start", "suffix": "end"})
    assert r.status_code == 200
    js = r.json()
    assert "prompt" in js
    assert "tokens" in js

    r = client.post(f"/api/v1/adapters/{aid}/deactivate")
    assert r.status_code == 200
    assert r.json()["adapter"]["active"] is False


def test_create_adapters_allows_same_name_with_different_versions(
    client: TestClient, mock_storage: MagicMock
):
    """Adapters may share a name as long as their versions differ."""

    mock_storage.exists.return_value = True
    import uuid

    base_name = "dup-" + uuid.uuid4().hex

    first = {
        "name": base_name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    r1 = client.post("/api/v1/adapters", json=first)
    assert r1.status_code == 201

    second = {**first, "version": "v2", "file_path": "/fake/path2"}
    r2 = client.post("/api/v1/adapters", json=second)
    assert r2.status_code == 201

    duplicate = {**first, "file_path": "/fake/path3"}
    r3 = client.post("/api/v1/adapters", json=duplicate)
    assert r3.status_code == 400
    body = r3.json()
    assert (
        body.get("detail") == "adapter with this name and version already exists"
        or body.get("title") == "adapter with this name and version already exists"
    )


def test_deliveries_enqueue(client: TestClient, mock_storage: MagicMock):
    """Compose with delivery should create a DeliveryJob and be retrievable."""
    mock_storage.exists.return_value = True
    import uuid

    name = "t2-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 0.5,
    }
    r = client.post("/api/v1/adapters", json=data)
    assert r.status_code == 201
    aid = r.json()["adapter"]["id"]
    client.post(f"/api/v1/adapters/{aid}/activate")

    # compose with delivery -> should create a delivery job and return id
    payload = {"prefix": "p", "delivery": {"mode": "cli", "cli": {}}}
    r = client.post("/api/v1/compose", json=payload)
    assert r.status_code == 200
    js = r.json()
    assert js.get("delivery") and js["delivery"].get("id")
    did = js["delivery"]["id"]

    r = client.get(f"/api/v1/deliveries/{did}")
    assert r.status_code == 200
    dj = r.json()["delivery"]
    assert dj["id"] == did


def test_compose_uses_primary_queue_backend(
    client: TestClient,
    db_session,
    mock_storage: MagicMock,
):
    """Compose should enqueue via the configured primary queue backend."""

    _create_active_adapter(client, mock_storage)

    queue_backend = RecordingQueueBackend()

    def override_service_container():
        return ServiceContainer(
            db_session,
            queue_backend=queue_backend,
            fallback_queue_backend=None,
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
    assert body["delivery"]["id"]

    assert len(queue_backend.calls) == 1
    call = queue_backend.calls[0]
    assert call["job_id"] == body["delivery"]["id"]
    assert call["background_tasks"] is not None


def test_compose_falls_back_to_background_queue(
    client: TestClient,
    db_session,
    mock_storage: MagicMock,
):
    """Compose should fall back when the primary queue raises."""

    _create_active_adapter(client, mock_storage)

    primary_queue = FailingQueueBackend()
    fallback_queue = RecordingQueueBackend()

    def override_service_container():
        return ServiceContainer(
            db_session,
            queue_backend=primary_queue,
            fallback_queue_backend=fallback_queue,
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
    assert body["delivery"]["id"]

    assert primary_queue.attempts == 1
    assert len(fallback_queue.calls) == 1
    call = fallback_queue.calls[0]
    assert call["job_id"] == body["delivery"]["id"]
    assert call["background_tasks"] is not None


def test_compose_sdnext_delivery(
    client: TestClient, mock_storage: MagicMock, monkeypatch
):
    """Compose endpoint should accept SDNext delivery configuration."""

    mock_storage.exists.return_value = True
    import uuid

    adapter_payload = {
        "name": "sdnext-" + uuid.uuid4().hex,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 0.75,
    }
    create_response = client.post("/api/v1/adapters", json=adapter_payload)
    assert create_response.status_code == 201
    adapter_id = create_response.json()["adapter"]["id"]
    activate_response = client.post(f"/api/v1/adapters/{adapter_id}/activate")
    assert activate_response.status_code == 200

    captured: dict[str, object] = {}

    def fake_sdnext(prompt: str, params: dict, job_id: str) -> None:
        captured["prompt"] = prompt
        captured["params"] = params
        captured["job_id"] = job_id

    monkeypatch.setattr("backend.api.v1.compose._deliver_sdnext", fake_sdnext)

    sdnext_config = {
        "generation_params": {
            "prompt": "seed prompt",
            "negative_prompt": "avoid",  # ensure optional field is respected
            "steps": 15,
            "sampler_name": "DPM++ 2M",
            "cfg_scale": 6.5,
            "width": 512,
            "height": 512,
            "seed": 1234,
            "batch_size": 1,
            "n_iter": 1,
            "denoising_strength": 0.35,
        },
        "mode": "deferred",
        "save_images": False,
        "return_format": "url",
    }

    payload = {
        "prefix": "generate with sdnext",
        "delivery": {
            "mode": "sdnext",
            "sdnext": sdnext_config,
        },
    }

    response = client.post("/api/v1/compose", json=payload)
    assert response.status_code == 200
    body = response.json()

    assert body.get("delivery") is not None
    delivery_info = body["delivery"]
    assert delivery_info.get("id")
    assert delivery_info.get("status") == "pending"

    assert captured  # background task captured the sdnext payload
    assert captured["job_id"] == delivery_info["id"]
    assert captured["params"] == sdnext_config
    assert "<lora:" in str(captured["prompt"])


def test_generation_generate_request(client: TestClient, monkeypatch):
    """Generation endpoint should complete without duplicate parameter errors."""

    class DummyGenerationBackend:
        async def generate_image(self, prompt, params):
            assert params["generation_params"]["prompt"] == "test prompt"
            return SDNextGenerationResult(
                job_id="dummy-job",
                status="completed",
                images=["image-data"],
            )

    monkeypatch.setattr(
        "backend.services.generation.get_generation_backend",
        lambda backend_name: DummyGenerationBackend(),
    )

    payload = {
        "prompt": "test prompt",
        "steps": 5,
    }

    response = client.post("/api/v1/generation/generate", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
