"""HTTP client helpers for delivery backends."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import aiohttp


class DeliveryHTTPClient:
    """Helper for managing HTTP sessions to external delivery services."""

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
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def timeout(self) -> int:
        """Return the configured timeout."""
        return self._timeout

    def is_configured(self) -> bool:
        """Return whether the client has a base URL configured."""
        return self._base_url is not None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create the underlying :class:`aiohttp.ClientSession`."""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self._timeout)
            self._session = aiohttp.ClientSession(timeout=timeout, auth=self._auth)
        return self._session

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

    async def close(self) -> None:
        """Close the underlying HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def __aenter__(self) -> "DeliveryHTTPClient":
        await self._get_session()
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        await self.close()
