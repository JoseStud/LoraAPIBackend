"""HTTP delivery implementation."""

import asyncio
from typing import Any, Dict

import aiohttp

from .base import DeliveryBackend


class HTTPDeliveryBackend(DeliveryBackend):
    """HTTP delivery backend implementation."""

    def __init__(self, timeout: int = 30):
        """Initialize HTTP backend.

        Args:
            timeout: Request timeout in seconds

        """
        self.timeout = timeout

    async def deliver(self, prompt: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Deliver prompt via HTTP POST.

        Args:
            prompt: The composed prompt
            params: HTTP parameters (host, port, path)

        Returns:
            Dict with delivery result

        """
        host = params.get("host")
        port = params.get("port", 80)
        path = params.get("path", "/")

        if not host:
            return {"status": "error", "detail": "Missing required parameter: host"}

        url = f"http://{host}:{port}{path}"
        payload = {"prompt": prompt}

        try:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload) as response:
                    response_text = await response.text()
                    return {
                        "status": response.status,
                        "detail": response_text,
                        "headers": dict(response.headers),
                    }
        except asyncio.TimeoutError:
            return {
                "status": "error",
                "detail": f"Request timeout after {self.timeout}s",
            }
        except Exception as exc:
            return {"status": "error", "detail": str(exc)}

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "http"
