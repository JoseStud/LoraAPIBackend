"""The shared delivery HTTP client works from any event loop."""

from __future__ import annotations

import asyncio
import threading

import pytest

from backend.delivery.http_client import DeliveryHTTPClient
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
