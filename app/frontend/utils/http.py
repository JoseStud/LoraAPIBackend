"""Provide minimal HTTP client helpers for unit tests and utilities.

This client implements construction and URL building logic required by
tests/unit/test_backend_validation.py.
"""

from __future__ import annotations

from typing import Dict, Optional
from urllib.parse import urlencode


class HTTPClient:
    """Provide a simple HTTP client facade with URL building support."""

    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        max_retries: int = 0,
    ) -> None:
        """Initialize an HTTP client configuration."""
        if not isinstance(base_url, str) or not base_url:
            raise ValueError("base_url must be a non-empty string")
        if not (base_url.startswith("http://") or base_url.startswith("https://")):
            raise ValueError("base_url must start with http:// or https://")
        if timeout is None or timeout <= 0:
            raise ValueError("timeout must be positive")
        self.base_url = base_url.rstrip("/")
        self.timeout = float(timeout)
        self.max_retries = int(max_retries)

    def _build_url(self, path: str, params: Optional[Dict[str, str]] = None) -> str:
        if not isinstance(path, str):
            raise ValueError("path must be a string")
        if not path.startswith("/"):
            path = "/" + path
        url = f"{self.base_url}{path}"
        if params:
            qs = urlencode(params, doseq=True)
            sep = "&" if ("?" in url) else "?"
            url = f"{url}{sep}{qs}"
        return url


__all__ = ["HTTPClient"]
