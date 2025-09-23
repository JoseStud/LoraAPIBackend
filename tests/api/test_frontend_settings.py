"""Frontend settings API tests."""

from fastapi.testclient import TestClient


def test_frontend_settings_endpoint(client: TestClient):
    """Frontend settings endpoint exposes runtime configuration."""
    response = client.get("/frontend/settings")
    assert response.status_code == 200
    payload = response.json()
    assert "backendUrl" in payload
    assert payload["backendUrl"].endswith("/api/v1")
