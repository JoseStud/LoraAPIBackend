"""Client helper for interacting with the SDNext HTTP API."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.core.config import settings

from .http_client import DeliveryHTTPClient


class SDNextClientError(RuntimeError):
    """Raised when the SDNext client encounters an error response."""

    def __init__(self, message: str, *, status: Optional[int] = None) -> None:
        super().__init__(message)
        self.status = status


class SDNextClient:
    """Wrapper around :class:`DeliveryHTTPClient` with SDNext-specific helpers."""

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
    ) -> Dict[str, Any]:
        """Submit a txt2img request and return the parsed JSON payload."""

        payload = self._build_txt2img_payload(prompt, generation_params or {})
        request_ctx = await self._http_client.request(
            "POST",
            "/sdapi/v1/txt2img",
            json=payload,
        )

        async with request_ctx as response:
            if response.status != 200:
                error_text = await response.text()
                raise SDNextClientError(
                    f"SDNext API error: {response.status} - {error_text}",
                    status=response.status,
                )

            return await response.json()

    async def get_progress(self) -> Dict[str, Any]:
        """Fetch progress information from the SDNext API."""

        request_ctx = await self._http_client.request("GET", "/sdapi/v1/progress")

        async with request_ctx as response:
            if response.status != 200:
                error_text = await response.text()
                raise SDNextClientError(
                    f"SDNext progress API error: {response.status} - {error_text}",
                    status=response.status,
                )

            return await response.json()

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
                "sampler_name", settings.SDNEXT_DEFAULT_SAMPLER
            ),
            "cfg_scale": generation_params.get(
                "cfg_scale", settings.SDNEXT_DEFAULT_CFG_SCALE
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
