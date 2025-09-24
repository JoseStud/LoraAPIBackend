"""Tests for the synchronous generation endpoint."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from backend.schemas import SDNextGenerationResult
from backend.core.dependencies import get_application_services, get_domain_services
from backend.main import app as backend_app


class DummyGenerationBackend:
    async def generate_image(self, prompt, params):
        assert params["generation_params"]["prompt"] == "test prompt"
        assert params["mode"] == "immediate"
        assert params["return_format"] == "base64"
        return SDNextGenerationResult(
            job_id="dummy-job",
            status="completed",
            images=["image-data"],
        )


def test_generation_generate_request(client: TestClient, monkeypatch):
    """Generation endpoint should complete without duplicate parameter errors."""

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


def test_generation_rejects_invalid_mode(client: TestClient):
    response = client.post(
        "/api/v1/generation/generate",
        params={"mode": "invalid"},
        json={"prompt": "test", "steps": 1},
    )

    assert response.status_code == 422


def test_generation_rejects_invalid_return_format(client: TestClient):
    response = client.post(
        "/api/v1/generation/generate",
        params={"return_format": "unsupported"},
        json={"prompt": "test", "steps": 1},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "query_param",
    [
        {"mode": "invalid"},
        {"return_format": "unsupported"},
    ],
)
def test_compose_and_generate_rejects_invalid_values(
    client: TestClient, query_param: dict[str, str]
):
    response = client.post(
        "/api/v1/generation/compose-and-generate",
        params=query_param,
        json={
            "compose_request": {"prefix": "hi"},
            "generation_params": {"prompt": "", "steps": 1},
        },
    )

    assert response.status_code == 422


def test_compose_and_generate_uses_shared_orchestration(client: TestClient):
    composition = SimpleNamespace(
        prompt="composed prompt",
        tokens=["<lora:test:1.0>"],
        warnings=["warn"],
    )
    generation_result = SDNextGenerationResult(
        job_id="job-123",
        status="running",
    )

    stub_domain = SimpleNamespace()
    stub_domain.adapters = object()
    stub_domain.compose = SimpleNamespace(
        compose_from_adapter_service=lambda adapters, prefix="", suffix="": composition
    )
    stub_domain.generation = SimpleNamespace(
        validate_generation_params=AsyncMock(return_value=[]),
        generate_image=AsyncMock(return_value=generation_result),
    )

    stub_application = SimpleNamespace(
        generation_coordinator=SimpleNamespace(
            broadcast_job_started=AsyncMock(),
        )
    )

    backend_app.dependency_overrides[get_domain_services] = lambda: stub_domain
    backend_app.dependency_overrides[get_application_services] = lambda: stub_application

    response = client.post(
        "/api/v1/generation/compose-and-generate",
        params={"mode": "deferred", "return_format": "url", "save_images": "false"},
        json={
            "compose_request": {"prefix": "hi", "suffix": "there"},
            "generation_params": {"prompt": "placeholder", "steps": 1},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == "job-123"

    validate_call = stub_domain.generation.validate_generation_params.await_args
    assert validate_call.args[0].prompt == "composed prompt"

    generate_call = stub_domain.generation.generate_image.await_args
    assert generate_call.args[0] == "composed prompt"
    assert generate_call.kwargs["mode"] == "deferred"
    assert generate_call.kwargs["return_format"] == "url"
    assert generate_call.kwargs["save_images"] is False

    stub_application.generation_coordinator.broadcast_job_started.assert_awaited_once_with(
        "job-123", validate_call.args[0]
    )
