"""HTTP client helpers for delivery backends."""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Callable, Dict, Iterable, Optional

import aiohttp

from backend.core.logging import get_logger

logger = get_logger(__name__)


class DeliveryHTTPClient:
    """Helper for managing HTTP sessions to external delivery services.

    An :class:`aiohttp.ClientSession` belongs to the event loop it was created
    on, while one client is shared by the API's loop (progress polling,
    interrupts), the in-process job runner's loop and successive
    ``asyncio.run`` calls in an RQ worker. The client therefore keeps one
    session per event loop and drops sessions whose loop has closed.
    """

    def __init__(
        self,
        base_url: Optional[str],
        *,
        timeout: int,
        username: Optional[str] = None,
        password: Optional[str] = None,
        health_check_path: str = "/sdapi/v1/options",
    ) -> None:
        """Initialize the HTTP client helper."""
        self._base_url = base_url.rstrip("/") if base_url else None
        self._timeout = timeout
        self._health_check_path = health_check_path
        self._auth = None
        if username and password:
            self._auth = aiohttp.BasicAuth(username, password)
        self._sessions: Dict[asyncio.AbstractEventLoop, aiohttp.ClientSession] = {}
        self._sessions_lock = threading.Lock()

    @property
    def timeout(self) -> int:
        """Return the configured timeout."""
        return self._timeout

    def is_configured(self) -> bool:
        """Return whether the client has a base URL configured."""
        return self._base_url is not None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create the :class:`aiohttp.ClientSession` for the running loop."""
        loop = asyncio.get_running_loop()
        with self._sessions_lock:
            stale = self._pop_sessions(lambda other: other.is_closed())
            session = self._sessions.get(loop)
            if session is None or session.closed:
                timeout = aiohttp.ClientTimeout(total=self._timeout)
                session = aiohttp.ClientSession(timeout=timeout, auth=self._auth)
                self._sessions[loop] = session
        await self._close_sessions(stale.values())
        return session

    def _pop_sessions(
        self, predicate: Callable[[asyncio.AbstractEventLoop], bool]
    ) -> Dict[asyncio.AbstractEventLoop, aiohttp.ClientSession]:
        """Remove and return the sessions whose loop matches ``predicate``.

        The caller holds ``_sessions_lock``.
        """
        loops = [loop for loop in self._sessions if predicate(loop)]
        return {loop: self._sessions.pop(loop) for loop in loops}

    @staticmethod
    async def _close_sessions(sessions: Iterable[aiohttp.ClientSession]) -> None:
        """Close sessions owned by the running loop or by a closed loop.

        Once a session's loop has closed its connections can no longer be shut
        down, so closing it only marks it closed, which is safe from any loop.
        """
        for session in sessions:
            try:
                await session.close()
            except Exception:  # pragma: no cover - defensive guard
                logger.debug("Closing a stale HTTP session failed", exc_info=True)

    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not self._base_url:
            raise RuntimeError("HTTP client base URL is not configured")
        if not path.startswith("/"):
            path = "/" + path
        return f"{self._base_url}{path}"

    async def request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> aiohttp.client._RequestContextManager:
        """Create a request context manager for the configured session."""
        session = await self._get_session()
        url = self._build_url(path)
        return session.request(method, url, **kwargs)

    async def health_check(self, path: Optional[str] = None) -> bool:
        """Perform a simple GET request to confirm the service is responsive."""
        if not self.is_configured():
            return False

        check_path = path or self._health_check_path

        try:
            request_ctx = await self.request("GET", check_path)
            async with request_ctx as response:
                return response.status == 200
        except (asyncio.TimeoutError, aiohttp.ClientError, RuntimeError):
            return False

    async def close_loop_session(self) -> None:
        """Close the running loop's session and drop those of closed loops.

        Sessions of other live loops are left alone. Call this before a loop
        that used the client ends (each ``asyncio.run`` in an RQ worker), so
        the session shuts down on its own loop instead of being left open.
        """
        loop = asyncio.get_running_loop()
        with self._sessions_lock:
            closable = self._pop_sessions(
                lambda other: other is loop or other.is_closed()
            )
        await self._close_sessions(closable.values())

    async def close(self) -> None:
        """Close the session of the running loop and those of closed loops.

        A session that belongs to another running loop is closed on that loop
        without waiting for it; one whose loop is idle is kept for that loop.
        """
        loop = asyncio.get_running_loop()
        with self._sessions_lock:
            closable = self._pop_sessions(
                lambda other: other is loop or other.is_closed()
            )
            elsewhere = self._pop_sessions(lambda other: other.is_running())
        await self._close_sessions(closable.values())
        for other, session in elsewhere.items():
            try:
                asyncio.run_coroutine_threadsafe(session.close(), other)
            except RuntimeError:  # pragma: no cover - loop closed meanwhile
                pass

    async def __aenter__(self) -> "DeliveryHTTPClient":
        """Open the HTTP session when entering the async context."""
        await self._get_session()
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        """Close the HTTP session when leaving the async context."""
        await self.close()
