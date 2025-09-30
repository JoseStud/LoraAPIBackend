"""Frontend settings API tests."""

from fastapi.testclient import TestClient

from backend.core.config import settings as backend_settings


def test_frontend_settings_endpoint(client: TestClient):
    """Frontend settings endpoint exposes runtime configuration."""
    response = client.get("/frontend/settings")
    assert response.status_code == 200
    payload = response.json()
    assert "backendUrl" in payload
    assert payload["backendUrl"].endswith("/api/v1")
    assert payload["generationPolling"] == {
        "queueMs": backend_settings.GENERATION_QUEUE_POLL_INTERVAL_MS,
        "websocketRetryMs": backend_settings.GENERATION_WEBSOCKET_RETRY_INTERVAL_MS,
        "systemStatusMs": backend_settings.GENERATION_SYSTEM_STATUS_POLL_INTERVAL_MS,
    }
