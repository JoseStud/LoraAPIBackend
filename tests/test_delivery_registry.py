"""Tests for explicit, idempotent delivery backend registration."""

from __future__ import annotations

import asyncio
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
from fastapi import FastAPI

import backend.delivery as delivery
import backend.main as main_module
from backend.delivery.base import DeliveryRegistry
from backend.services.queue import QueueOrchestrator
from backend.workers import context as context_module
from backend.workers.context import WorkerContext

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def fresh_registry(monkeypatch):
    """Swap in an empty, uninitialised registry for the duration of a test."""
    registry = DeliveryRegistry()
    monkeypatch.setattr(delivery, "_registry", registry)
    monkeypatch.setattr(delivery, "_registry_initialized", False)
    return registry


def test_importing_backend_does_not_register_backends():
    """Importing the app and the workers leaves the registry untouched."""
    script = (
        "import backend.delivery as d\n"
        "import backend.main, backend.workers.tasks\n"
        "assert d._registry_initialized is False\n"
        "assert d._registry.list_available_backends() == "
        "{'delivery': {}, 'generation': {}}\n"
    )
    subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    )


def test_get_delivery_registry_registers_builtin_backends(fresh_registry):
    """The accessor populates the registry on first use."""
    registry = delivery.get_delivery_registry()

    assert registry is fresh_registry
    assert registry.get_delivery_backend("http") is not None
    assert registry.get_delivery_backend("cli") is not None
    assert registry.get_generation_backend("sdnext") is not None


def test_ensure_delivery_system_is_idempotent(fresh_registry):
    """Repeated calls keep the backends registered by the first call."""
    first = delivery.ensure_delivery_system()
    http_backend = first.get_delivery_backend("http")
    sdnext_backend = first.get_generation_backend("sdnext")

    second = delivery.ensure_delivery_system()

    assert second is first
    assert second.get_delivery_backend("http") is http_backend
    assert second.get_generation_backend("sdnext") is sdnext_backend


def test_ensure_delivery_system_registers_once_across_threads(
    fresh_registry, monkeypatch
):
    """Concurrent callers trigger exactly one registration."""
    calls = []
    original = delivery._register_builtin_backends

    def slow_register(registry):
        calls.append(registry)
        time.sleep(0.05)
        original(registry)

    monkeypatch.setattr(delivery, "_register_builtin_backends", slow_register)

    barrier = threading.Barrier(8)

    def worker():
        barrier.wait()
        delivery.ensure_delivery_system()

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert calls == [fresh_registry]


def test_backend_lookup_helpers_use_the_accessor(fresh_registry):
    """``get_*_backend`` helpers see the registered backends."""
    assert delivery.get_delivery_backend("cli").get_backend_name() == "cli"
    assert delivery.get_generation_backend("sdnext") is not None
    with pytest.raises(ValueError):
        delivery.get_delivery_backend("missing")


def test_worker_context_build_default_ensures_delivery_system(monkeypatch):
    """Worker start-up registers the backends before building the context."""
    calls = []
    monkeypatch.setattr(
        context_module, "ensure_delivery_system", lambda: calls.append(True)
    )

    WorkerContext.build_default(
        queue_orchestrator=QueueOrchestrator(redis_url_factory=lambda: None),
        recommendation_gpu_available=False,
    )

    assert calls == [True]


def test_lifespan_ensures_delivery_system(monkeypatch):
    """The API lifespan registers the backends at startup."""
    calls = []
    monkeypatch.setattr(
        main_module, "ensure_delivery_system", lambda: calls.append(True)
    )
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    monkeypatch.setattr(main_module, "setup_logging", lambda: None)
    monkeypatch.setattr(
        main_module.EmbeddingService, "preload_models", lambda *a, **k: None
    )
    monkeypatch.setattr(main_module.settings, "IMPORT_ON_STARTUP", False)

    async def run_lifespan():
        async with main_module.lifespan(FastAPI()):
            assert calls == [True]

    asyncio.run(run_lifespan())
