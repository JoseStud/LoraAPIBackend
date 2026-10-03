"""Regression tests for the actual mounted ASGI application's lifespan."""

from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

from app.main import app, backend_app


def test_outer_application_enters_backend_lifespan_once(monkeypatch):
    events = []

    @asynccontextmanager
    async def lifecycle(application):
        assert application is backend_app
        events.append("startup")
        yield
        events.append("shutdown")

    monkeypatch.setattr(backend_app.router, "lifespan_context", lifecycle)
    with TestClient(app) as client:
        assert events == ["startup"]
        assert client.get("/health").status_code == 200
        assert client.get("/api/openapi.json").status_code == 200
    assert events == ["startup", "shutdown"]


def test_backend_startup_failure_prevents_readiness(monkeypatch):
    @asynccontextmanager
    async def lifecycle(application):
        raise RuntimeError("migration failed")
        yield

    monkeypatch.setattr(backend_app.router, "lifespan_context", lifecycle)
    with pytest.raises(RuntimeError, match="migration failed"), TestClient(app):
        pytest.fail("Server became ready after migration failure")
