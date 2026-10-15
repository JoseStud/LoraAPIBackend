"""Guard against route handlers that block the event loop."""

from __future__ import annotations

import ast
import inspect
import textwrap

from fastapi.routing import APIRoute, APIWebSocketRoute

from backend.main import create_app


def _awaits(func) -> bool:
    tree = ast.parse(textwrap.dedent(inspect.getsource(func)))
    return any(
        isinstance(node, (ast.Await, ast.AsyncFor, ast.AsyncWith))
        for node in ast.walk(tree)
    )


def test_async_handlers_await_something():
    """An ``async def`` handler that never awaits runs its I/O on the event loop.

    Handlers doing only synchronous work must be plain ``def`` so FastAPI runs
    them in the threadpool.
    """
    app = create_app()
    offenders = sorted(
        f"{route.endpoint.__module__}.{route.endpoint.__name__}"
        for route in app.routes
        if isinstance(route, (APIRoute, APIWebSocketRoute))
        and inspect.iscoroutinefunction(route.endpoint)
        and not _awaits(route.endpoint)
    )
    assert offenders == []
