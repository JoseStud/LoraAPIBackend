"""Tests for the compose endpoint behaviour."""

import pytest
from fastapi.testclient import TestClient


def test_compose_returns_warnings_when_no_active_adapters(client: TestClient):
    """Compose should surface validation warnings from the composition service."""
    response = client.post("/api/v1/compose", json={"prefix": "hello"})
    assert response.status_code == 200
    body = response.json()
    assert body["warnings"], "Expected warnings when no adapters are active"
    assert "No active adapters" in " ".join(body["warnings"])


def test_compose_sdnext_delivery(
    client: TestClient,
    create_active_adapter,
    monkeypatch: pytest.MonkeyPatch,
):
    """Compose endpoint should accept SDNext delivery configuration."""
    create_active_adapter(client)

    captured: dict[str, object] = {}

    async def fake_execute(self, prompt: str, mode: str, params: dict) -> dict:
        captured["prompt"] = prompt
        captured["params"] = params
        captured["mode"] = mode
        return {"status": "succeeded"}

    monkeypatch.setattr(
        "backend.workers.delivery_runner.DeliveryRunner._execute_delivery_backend",
        fake_execute,
    )

    sdnext_config = {
        "generation_params": {
            "prompt": "seed prompt",
            "negative_prompt": "avoid",
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
    assert body.get("warnings") == []

    assert body.get("delivery") is not None
    delivery_info = body["delivery"]
    assert delivery_info.get("id")
    assert delivery_info.get("status") == "pending"

    assert captured
    assert captured["mode"] == "sdnext"

    params = captured["params"]
    assert params["backend"] == "sdnext"
    assert params["mode"] == sdnext_config["mode"]
    assert params["save_images"] is sdnext_config["save_images"]
    assert params["return_format"] == sdnext_config["return_format"]

    generation_params = params["generation_params"]
    assert generation_params["prompt"] == body["prompt"]
    for key, value in sdnext_config["generation_params"].items():
        if key == "prompt":
            continue
        assert generation_params[key] == value
    assert "<lora:" in str(captured["prompt"])
