"""The backend's one CORS policy, standalone and mounted by app.main."""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.main import app as composed_app
from app.main import backend_app
from backend.core.config import settings as backend_settings
from backend.main import create_app

DEV_ORIGIN = "http://localhost:5173"
OTHER_ORIGIN = "http://elsewhere.test"


def _preflight(client: TestClient, path: str, origin: str):
    return client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-API-Key",
        },
    )


def _single(response, name: str) -> str | None:
    """Return the header's value, failing if a second middleware added it again."""
    values = response.headers.get_list(name)
    assert len(values) <= 1, f"{name} sent {len(values)} times: {values}"
    return values[0] if values else None


def _mount_like_app_main(backend: FastAPI) -> FastAPI:
    """Compose a backend the way app.main does, for settings changed after import."""
    root = FastAPI()
    root.mount("/api", backend)
    return root


def test_composition_root_adds_no_cors_middleware_of_its_own():
    """Only create_app() installs CORS, so /api requests pass through one policy."""
    assert not [m for m in composed_app.user_middleware if m.cls is CORSMiddleware]
    assert [m for m in backend_app.user_middleware if m.cls is CORSMiddleware]


def test_explicit_origin_preflight_through_app_main():
    """A configured origin gets one credentialed preflight answer under /api."""
    response = _preflight(TestClient(composed_app), "/api/v1/adapters", DEV_ORIGIN)

    assert response.status_code == 200
    assert _single(response, "access-control-allow-origin") == DEV_ORIGIN
    assert _single(response, "access-control-allow-credentials") == "true"
    assert _single(response, "access-control-allow-methods") is not None


def test_explicit_origin_simple_request_through_app_main():
    """A simple request from a configured origin carries the headers once."""
    response = TestClient(composed_app).get(
        "/api/health", headers={"Origin": DEV_ORIGIN}
    )

    assert response.status_code == 200
    assert _single(response, "access-control-allow-origin") == DEV_ORIGIN
    assert _single(response, "access-control-allow-credentials") == "true"


def test_unlisted_origin_is_not_admitted_through_app_main():
    """Origins outside CORS_ORIGINS get no Access-Control-Allow-Origin."""
    client = TestClient(composed_app)

    preflight = _preflight(client, "/api/v1/adapters", OTHER_ORIGIN)
    assert preflight.status_code == 400
    assert _single(preflight, "access-control-allow-origin") is None

    simple = client.get("/api/health", headers={"Origin": OTHER_ORIGIN})
    assert _single(simple, "access-control-allow-origin") is None


def test_spa_side_routes_get_no_cors_headers():
    """The composition root's own routes are same-origin and send no CORS headers."""
    response = TestClient(composed_app).get("/health", headers={"Origin": DEV_ORIGIN})

    assert response.status_code == 200
    assert _single(response, "access-control-allow-origin") is None


@pytest.mark.parametrize("mounted", [False, True], ids=["standalone", "mounted"])
def test_wildcard_origin_never_allows_credentials(monkeypatch, mounted):
    """With "*" configured the backend answers "*" and drops credentials."""
    monkeypatch.setattr(backend_settings, "CORS_ORIGINS", ["*"])
    monkeypatch.setattr(backend_settings, "CORS_ALLOW_CREDENTIALS", True)
    backend = create_app()
    app = _mount_like_app_main(backend) if mounted else backend
    prefix = "/api" if mounted else ""
    client = TestClient(app)

    preflight = _preflight(client, f"{prefix}/v1/adapters", OTHER_ORIGIN)
    assert preflight.status_code == 200
    assert _single(preflight, "access-control-allow-origin") == "*"
    assert _single(preflight, "access-control-allow-credentials") is None

    simple = client.get(f"{prefix}/health", headers={"Origin": OTHER_ORIGIN})
    assert simple.status_code == 200
    assert _single(simple, "access-control-allow-origin") == "*"
    assert _single(simple, "access-control-allow-credentials") is None


def test_credentials_can_be_turned_off_for_explicit_origins(monkeypatch):
    """CORS_ALLOW_CREDENTIALS=false is honoured for a listed origin."""
    monkeypatch.setattr(backend_settings, "CORS_ORIGINS", [DEV_ORIGIN])
    monkeypatch.setattr(backend_settings, "CORS_ALLOW_CREDENTIALS", False)

    response = TestClient(create_app()).get("/health", headers={"Origin": DEV_ORIGIN})

    assert _single(response, "access-control-allow-origin") == DEV_ORIGIN
    assert _single(response, "access-control-allow-credentials") is None
