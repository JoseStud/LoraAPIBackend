"""Tests for the synchronous generation endpoint."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import backend_app
from backend.core.dependencies import get_services
from backend.schemas import SDNextGenerationResult


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
    client: TestClient,
    query_param: dict[str, str],
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

    stub_services = SimpleNamespace()
    stub_services.adapters = object()
    stub_services.compose = SimpleNamespace(
        compose_from_adapter_service=lambda adapters, prefix="", suffix="": composition,
    )
    stub_services.generation = SimpleNamespace(
        validate_generation_params=AsyncMock(return_value=[]),
        generate_image=AsyncMock(return_value=generation_result),
    )

    backend_app.dependency_overrides[get_services] = lambda: stub_services

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

    validate_call = stub_services.generation.validate_generation_params.await_args
    assert validate_call.args[0].prompt == "composed prompt"

    generate_call = stub_services.generation.generate_image.await_args
    assert generate_call.args[0] == "composed prompt"
    assert generate_call.kwargs["mode"] == "deferred"
    assert generate_call.kwargs["return_format"] == "url"
    assert generate_call.kwargs["save_images"] is False
