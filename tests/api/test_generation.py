"""Tests for the synchronous generation endpoint."""

from fastapi.testclient import TestClient

from backend.schemas import SDNextGenerationResult


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
