"""Frontend settings API tests."""

import pytest
from fastapi.testclient import TestClient

from backend.api.v1.frontend import normalise_public_api_url
from backend.core.config import settings as backend_settings
from backend.main import create_app


def test_frontend_settings_endpoint(client: TestClient):
    """The SPA's runtime configuration is served under its /api/v1 base."""
    response = client.get("/api/v1/frontend/settings")
    assert response.status_code == 200
    payload = response.json()
    assert payload["backendUrl"].endswith("/api/v1")
    assert payload["generationPolling"] == {
        "queueMs": backend_settings.GENERATION_QUEUE_POLL_INTERVAL_MS,
        "websocketRetryMs": backend_settings.GENERATION_WEBSOCKET_RETRY_INTERVAL_MS,
        "systemStatusMs": backend_settings.GENERATION_SYSTEM_STATUS_POLL_INTERVAL_MS,
    }


def test_frontend_settings_are_keyless(client: TestClient, monkeypatch):
    """The SPA loads the key from this route, so the route cannot require it."""
    monkeypatch.setattr(backend_settings, "API_KEY", "secret-key")

    assert client.get("/api/v1/adapters").status_code == 403

    response = client.get("/api/v1/frontend/settings")
    assert response.status_code == 200
    assert response.json()["backendApiKey"] == "secret-key"


def test_frontend_settings_are_part_of_the_backend_openapi():
    """Registered in create_app(), so the generated API types include it."""
    paths = create_app().openapi()["paths"]
    operation = paths["/v1/frontend/settings"]["get"]
    schema_ref = operation["responses"]["200"]["content"]["application/json"]
    assert schema_ref["schema"] == {"$ref": "#/components/schemas/FrontendSettings"}


def test_root_frontend_settings_route_is_gone(client: TestClient):
    """Only /api/v1/frontend/settings serves the settings.

    The root path falls through to the SPA (index.html, or 404 without a build).
    """
    response = client.get("/frontend/settings")
    assert "backendUrl" not in response.text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, "/api/v1"),
        ("", "/api/v1"),
        ("   ", "/api/v1"),
        ("/", "/api/v1"),
        ("api/v1/", "/api/v1"),
        ("/custom/base/", "/custom/base"),
        ("http://example.test:8000/api/v1/", "http://example.test:8000/api/v1"),
        ("https://lora.lan/api/v1", "https://lora.lan/api/v1"),
    ],
)
def test_normalise_public_api_url(raw, expected):
    """BACKEND_URL becomes an absolute URL or a rooted path without a slash."""
    assert normalise_public_api_url(raw) == expected
