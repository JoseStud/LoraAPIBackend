"""Tests for the problem-detail exception handlers."""

import logging

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.main import create_app


def test_unhandled_errors_do_not_leak_exception_text(
    caplog: pytest.LogCaptureFixture,
):
    """Unexpected errors return a generic problem body and are logged."""
    app = create_app()

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret connection string postgres://user:pw@db")

    client = TestClient(app, raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="lora.api"):
        response = client.get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["title"] == "Internal Server Error"
    assert "secret" not in response.text
    assert "postgres://" not in response.text
    assert "secret connection string" in caplog.text


def _client_with_error_routes() -> TestClient:
    app = create_app()

    @app.get("/teapot")
    def teapot():
        raise HTTPException(status_code=418, detail="Short and stout")

    @app.get("/structured")
    def structured():
        raise HTTPException(
            status_code=409,
            detail={"field": "name", "conflicts_with": ["a", "b"]},
        )

    @app.get("/auth")
    def auth():
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "APIKey"},
        )

    @app.get("/starlette")
    def starlette_error():
        raise StarletteHTTPException(status_code=503)

    @app.get("/not-modified")
    def not_modified():
        raise HTTPException(status_code=304)

    return TestClient(app)


def test_string_detail_becomes_the_problem_title():
    """A handler's message is the title."""
    response = _client_with_error_routes().get("/teapot")

    assert response.status_code == 418
    assert response.json() == {
        "type": "about:blank",
        "status": 418,
        "title": "Short and stout",
    }


def test_structured_detail_is_passed_through():
    """A non-string detail keeps its structure in ``errors``."""
    response = _client_with_error_routes().get("/structured")

    assert response.status_code == 409
    assert response.json() == {
        "type": "about:blank",
        "status": 409,
        "title": "Conflict",
        "errors": {"field": "name", "conflicts_with": ["a", "b"]},
    }


def test_exception_headers_are_kept():
    """WWW-Authenticate and similar headers survive the problem formatting."""
    response = _client_with_error_routes().get("/auth")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "APIKey"
    assert response.json()["title"] == "Not authenticated"


def test_starlette_http_exceptions_use_the_problem_shape():
    """Starlette's own HTTPException (default detail) is formatted too."""
    response = _client_with_error_routes().get("/starlette")

    assert response.status_code == 503
    assert response.json() == {
        "type": "about:blank",
        "status": 503,
        "title": "Service Unavailable",
    }


def test_bodyless_statuses_get_no_body():
    """304, like 204, must not carry a body."""
    response = _client_with_error_routes().get("/not-modified")

    assert response.status_code == 304
    assert response.content == b""


def test_unknown_route_is_a_problem_detail(client: TestClient):
    """The router's 404, under the /api mount, uses the problem shape."""
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "type": "about:blank",
        "status": 404,
        "title": "Not Found",
    }


def test_wrong_method_is_a_problem_detail_with_allow(client: TestClient):
    """The router's 405 keeps its Allow header."""
    response = client.delete("/api/v1/frontend/settings")

    assert response.status_code == 405
    assert response.headers["allow"] == "GET"
    assert response.json() == {
        "type": "about:blank",
        "status": 405,
        "title": "Method Not Allowed",
    }
