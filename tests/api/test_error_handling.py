"""Tests for the generic exception handler."""

import logging

import pytest
from fastapi.testclient import TestClient

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
