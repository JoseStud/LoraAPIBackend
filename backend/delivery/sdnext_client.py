"""Client helpers for interacting with the SDNext HTTP API."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Optional

from backend.core.config import settings

from .http_client import DeliveryHTTPClient


@dataclass
class SDNextResponse:
    """Structured response returned by :class:`SDNextSession`."""

    ok: bool
    status: Optional[int]
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class SDNextSession:
    """Lightweight helper owning SDNext connectivity and requests."""

    def __init__(
        self,
        http_client: Optional[DeliveryHTTPClient] = None,
    ) -> None:
        self._http_client = http_client or DeliveryHTTPClient(
            settings.SDNEXT_BASE_URL,
            timeout=settings.SDNEXT_TIMEOUT,
            username=settings.SDNEXT_USERNAME,
            password=settings.SDNEXT_PASSWORD,
        )

    def is_configured(self) -> bool:
        """Return whether the underlying HTTP client is configured."""

        return self._http_client.is_configured()

    async def close(self) -> None:
        """Close the underlying HTTP client."""

        await self._http_client.close()

    async def health_check(self) -> bool:
        """Perform a health check against the SDNext API."""

        return await self._http_client.health_check()

    async def submit_txt2img(
        self,
        prompt: str,
        generation_params: Optional[Dict[str, Any]] = None,
    ) -> SDNextResponse:
        """Submit a txt2img request and return a structured response."""

        payload = self._build_txt2img_payload(prompt, generation_params or {})
        return await self._request(
            "POST",
            "/sdapi/v1/txt2img",
            json=payload,
        )

    async def get_progress(self) -> SDNextResponse:
        """Fetch progress information from the SDNext API."""

        return await self._request("GET", "/sdapi/v1/progress")

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> SDNextResponse:
        if not self._http_client.is_configured():
            return SDNextResponse(False, None, error="SDNext session not configured")

        try:
            request_ctx = await self._http_client.request(method, path, **kwargs)
        except asyncio.TimeoutError:
            return SDNextResponse(False, None, error="Request timed out")
        except Exception as exc:  # pragma: no cover - defensive
            return SDNextResponse(False, None, error=str(exc))

        async with request_ctx as response:
            status = getattr(response, "status", None)
            try:
                if status != 200:
                    text = await response.text()
                    error = text or f"HTTP {status}"
                    return SDNextResponse(False, status, error=error)

                data = await response.json()
            except Exception as exc:  # pragma: no cover - defensive
                return SDNextResponse(False, status, error=str(exc))

        return SDNextResponse(True, status, data=data)

    def _build_txt2img_payload(
        self,
        prompt: str,
        generation_params: Dict[str, Any],
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "prompt": prompt,
            "negative_prompt": generation_params.get("negative_prompt", ""),
            "steps": generation_params.get("steps", settings.SDNEXT_DEFAULT_STEPS),
            "sampler_name": generation_params.get(
                "sampler_name", settings.SDNEXT_DEFAULT_SAMPLER,
            ),
            "cfg_scale": generation_params.get(
                "cfg_scale", settings.SDNEXT_DEFAULT_CFG_SCALE,
            ),
            "width": generation_params.get("width", 512),
            "height": generation_params.get("height", 512),
            "seed": generation_params.get("seed", -1),
            "batch_size": generation_params.get("batch_size", 1),
            "n_iter": generation_params.get("n_iter", 1),
        }

        if generation_params.get("denoising_strength") is not None:
            payload["denoising_strength"] = generation_params["denoising_strength"]

        return payload

