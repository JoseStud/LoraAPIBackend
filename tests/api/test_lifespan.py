"""Tests covering FastAPI lifespan behaviour."""

import asyncio
import logging
from threading import Event

import pytest
from fastapi import FastAPI

import backend.main as backend_main
from backend.main import lifespan


@pytest.mark.anyio
async def test_lifespan_preloads_recommendations_in_background(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    """The lifespan context should not block on recommendation preload."""
    caplog.set_level(logging.INFO, logger="lora.recommendations.startup")

    monkeypatch.setattr(backend_main, "setup_logging", lambda: None)
    monkeypatch.setattr(backend_main, "init_db", lambda: None)
    monkeypatch.setattr(
        backend_main.settings,
        "IMPORT_ON_STARTUP",
        False,
        raising=False,
    )

    start_event = Event()
    finish_event = Event()

    def _slow_preload() -> None:
        start_event.set()
        finish_event.wait(timeout=0.5)

    monkeypatch.setattr(
        backend_main.RecommendationService,
        "preload_models",
        _slow_preload,
    )

    app = FastAPI(lifespan=lifespan)
    ctx = app.router.lifespan_context(app)

    try:
        await asyncio.wait_for(ctx.__aenter__(), timeout=0.2)
        assert start_event.wait(timeout=0.2)
    finally:
        finish_event.set()
        await ctx.__aexit__(None, None, None)

    assert "Recommendation model preload completed successfully" in caplog.text


@pytest.mark.anyio
async def test_lifespan_logs_recommendation_preload_failure(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    """Failures during recommendation preload should be logged but not block startup."""
    caplog.set_level(logging.INFO, logger="lora.recommendations.startup")

    monkeypatch.setattr(backend_main, "setup_logging", lambda: None)
    monkeypatch.setattr(backend_main, "init_db", lambda: None)
    monkeypatch.setattr(
        backend_main.settings,
        "IMPORT_ON_STARTUP",
        False,
        raising=False,
    )

    def _failing_preload() -> None:
        raise RuntimeError("preload failed")

    monkeypatch.setattr(
        backend_main.RecommendationService,
        "preload_models",
        _failing_preload,
    )

    app = FastAPI(lifespan=lifespan)
    ctx = app.router.lifespan_context(app)

    try:
        await ctx.__aenter__()
    finally:
        await ctx.__aexit__(None, None, None)

    assert "Recommendation model preload failed" in caplog.text
