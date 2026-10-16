"""Outbound webhook announcing that a generation job reached a final status.

The payload is small on purpose: it never carries image data. Receivers fetch
the image from ``download_path`` with the usual ``X-API-Key`` header.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional, Union

import aiohttp

from backend.core.config import settings
from backend.core.logging import get_logger
from backend.schemas.delivery_jobs import DeliveryJobParams, DeliveryJobResult

logger = get_logger(__name__)

EVENT_NAME = "generation.finished"
NOTIFY_STATUSES = frozenset({"succeeded", "failed"})
_MAX_ERROR_LENGTH = 500


class JobWebhookNotifier:
    """POST a JSON summary of finished jobs to a configured URL."""

    def __init__(
        self,
        url: str,
        *,
        token: Optional[str] = None,
        token_header: str = "X-LoRA-Manager-Token",
        timeout: float = 5.0,
    ) -> None:
        """Store the target URL and optional shared-token header."""
        self._url = url
        self._token = token
        self._token_header = token_header
        self._timeout = timeout

    @classmethod
    def from_settings(cls) -> Optional["JobWebhookNotifier"]:
        """Build a notifier from settings, or ``None`` when no URL is set."""
        url = (settings.JOB_WEBHOOK_URL or "").strip()
        if not url:
            return None
        return cls(
            url,
            token=settings.JOB_WEBHOOK_TOKEN or None,
            token_header=settings.JOB_WEBHOOK_TOKEN_HEADER,
            timeout=settings.JOB_WEBHOOK_TIMEOUT,
        )

    @staticmethod
    def build_payload(
        job_id: str,
        status: str,
        prompt: str,
        params: Union[DeliveryJobParams, Mapping[str, Any]],
        result: Union[DeliveryJobResult, Mapping[str, Any]],
    ) -> Dict[str, Any]:
        """Describe a finished job without embedding any image data."""
        job_params = DeliveryJobParams.coerce(params)
        job_result = DeliveryJobResult.coerce(result)
        image_count = len(job_result.images or [])

        error: Optional[str] = None
        if status != "succeeded":
            raw_error = job_result.failure_message
            error = raw_error[:_MAX_ERROR_LENGTH] if raw_error else None

        return {
            "event": EVENT_NAME,
            "job_id": job_id,
            "status": status,
            "prompt": prompt,
            "backend": job_params.backend,
            "client_ref": job_params.client_ref,
            "generation_params": dict(job_params.generation_params or {}),
            "image_count": image_count,
            "download_path": (
                f"/api/v1/generation/results/{job_id}/download"
                if status == "succeeded" and image_count
                else None
            ),
            "error": error,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }

    async def send(self, payload: Mapping[str, Any]) -> bool:
        """POST ``payload``; log and swallow failures so jobs are unaffected."""
        headers = {"X-LoRA-Manager-Event": EVENT_NAME}
        if self._token:
            headers[self._token_header] = self._token

        try:
            timeout = aiohttp.ClientTimeout(total=self._timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    self._url, json=dict(payload), headers=headers
                ) as response:
                    if response.status >= 400:
                        logger.warning(
                            "Job webhook returned HTTP %s for job %s",
                            response.status,
                            payload.get("job_id"),
                        )
                        return False
                    return True
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            logger.warning(
                "Job webhook failed for job %s: %s",
                payload.get("job_id"),
                type(exc).__name__,
            )
            return False
