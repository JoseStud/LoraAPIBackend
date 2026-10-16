"""The shared delivery HTTP client works from any event loop."""

from __future__ import annotations

import asyncio
import gc
import threading
import warnings
from contextlib import contextmanager

import pytest

from backend.delivery.base import DeliveryRegistry, GenerationBackend
from backend.delivery.http_client import DeliveryHTTPClient
from backend.delivery.sdnext import SDNextGenerationBackend
from backend.schemas import SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.workers.context import _default_async_runner
from backend.workers.delivery_runner import DeliveryRunner
from tests.util.local_http import serve_json


@pytest.fixture
def base_url():
    with serve_json() as url:
        yield url


@pytest.fixture
def background_loop():
    """An event loop running on its own thread, like the in-process job runner."""
    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    try:
        yield loop
    finally:
        loop.call_soon_threadsafe(loop.stop)
        thread.join(timeout=5)
        loop.close()


def test_client_survives_successive_asyncio_runs(base_url):
    """Each asyncio.run gets a working session (the session used to stay bound
    to the first, closed loop, so every later health check failed)."""
    client = DeliveryHTTPClient(base_url, timeout=5)

    results = [asyncio.run(client.health_check()) for _ in range(3)]

    assert results == [True, True, True]
    # Sessions of closed loops are dropped rather than accumulated.
    assert len(client._sessions) == 1
    asyncio.run(client.close())
    assert client._sessions == {}


def test_client_serves_two_live_loops(base_url, background_loop):
    """The API loop and the job runner loop use the client side by side."""
    client = DeliveryHTTPClient(base_url, timeout=5)

    def on_background(coro):
        return asyncio.run_coroutine_threadsafe(coro, background_loop).result(5)

    async def main():
        assert on_background(client.health_check()) is True
        assert await client.health_check() is True
        assert on_background(client.health_check()) is True
        sessions = dict(client._sessions)
        assert len(sessions) == 2
        assert sessions[asyncio.get_running_loop()] is not sessions[background_loop]

        # Closing from this loop closes its own session and hands the other
        # one to its loop instead of touching it from the wrong thread.
        await client.close()
        on_background(asyncio.sleep(0.05))
        assert all(session.closed for session in sessions.values())
        assert client._sessions == {}

        # Both loops can carry on afterwards.
        assert await client.health_check() is True
        assert on_background(client.health_check()) is True
        await client.close()
        on_background(asyncio.sleep(0.05))

    asyncio.run(main())


def test_close_ignores_sessions_of_closed_loops(base_url):
    client = DeliveryHTTPClient(base_url, timeout=5)
    assert asyncio.run(client.health_check()) is True

    asyncio.run(client.close())

    assert client._sessions == {}


class _HealthCheckingBackend(GenerationBackend):
    """Uses the shared client during the job, as the SDNext backend does."""

    def __init__(self, client: DeliveryHTTPClient) -> None:
        self._client = client
        self.sessions = []

    async def generate_image(self, prompt, params) -> SDNextGenerationResult:
        assert await self._client.health_check() is True
        self.sessions.append(self._client._sessions[asyncio.get_running_loop()])
        return SDNextGenerationResult(job_id="x", status="completed")

    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        return SDNextGenerationResult(job_id=job_id, status="completed")

    def is_available(self) -> bool:
        return True


def _assert_no_unclosed_session_warning(recorded) -> None:
    gc.collect()
    messages = [str(warning.message) for warning in recorded]
    assert not [m for m in messages if "Unclosed" in m], messages


def test_worker_jobs_close_the_session_of_their_loop(base_url, db_session, monkeypatch):
    """Each RQ job runs on its own ``asyncio.run`` loop; the session it opened
    there is closed before the loop ends instead of being left open, which
    matters for SimpleWorker and other workers that keep the process alive."""
    client = DeliveryHTTPClient(base_url, timeout=5)
    backend = _HealthCheckingBackend(client)
    registry = DeliveryRegistry()
    registry.register_generation_backend("sdnext", backend)
    # The real SDNext backend sharing the client releases the loop's session.
    registry.register_generation_backend(
        "sdnext-shared", SDNextGenerationBackend(http_client=client)
    )

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(
        "backend.workers.delivery_runner.get_session_context",
        lambda: session_context(),
    )
    deliveries = DeliveryService(DeliveryJobRepository(db_session))
    runner = DeliveryRunner(registry, delivery_service_factory=lambda _: deliveries)

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        for _ in range(2):
            job = deliveries.create_job(
                "prompt", "sdnext", {"generation_params": {"prompt": "prompt"}}
            )
            runner.process_delivery_job(job.id, raise_on_error=True)
            assert deliveries.get_job(job.id).status == "succeeded"
        _assert_no_unclosed_session_warning(recorded)

    assert len(backend.sessions) == 2
    assert all(session.closed for session in backend.sessions)
    assert client._sessions == {}


def test_worker_context_runner_closes_loop_sessions(base_url, monkeypatch):
    """Recommendation tasks get the same per-loop cleanup."""
    client = DeliveryHTTPClient(base_url, timeout=5)
    registry = DeliveryRegistry()
    registry.register_generation_backend(
        "sdnext", SDNextGenerationBackend(http_client=client)
    )
    monkeypatch.setattr("backend.delivery.get_delivery_registry", lambda: registry)

    async def task():
        assert await client.health_check() is True
        return client._sessions[asyncio.get_running_loop()]

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        session = _default_async_runner(task())
        _assert_no_unclosed_session_warning(recorded)

    assert session.closed
    assert client._sessions == {}


def test_close_loop_session_leaves_other_live_loops_alone(base_url, background_loop):
    client = DeliveryHTTPClient(base_url, timeout=5)

    def on_background(coro):
        return asyncio.run_coroutine_threadsafe(coro, background_loop).result(5)

    async def main():
        assert on_background(client.health_check()) is True
        assert await client.health_check() is True
        own = client._sessions[asyncio.get_running_loop()]
        other = client._sessions[background_loop]

        await client.close_loop_session()

        assert own.closed
        assert not other.closed
        assert list(client._sessions) == [background_loop]

    asyncio.run(main())
    on_background(client.close())
