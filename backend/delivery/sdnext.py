"""SDNext generation delivery implementation."""

from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

from backend.core.config import settings
from backend.schemas import SDNextGenerationResult

from .base import GenerationBackend
from .http_client import DeliveryHTTPClient
from .sdnext_client import SDNextSession
from .storage import FileSystemImageStorage, ImageStorage


class SDNextGenerationBackend(GenerationBackend):
    """SDNext generation backend implementation."""

    def __init__(
        self,
        *,
        http_client: Optional[DeliveryHTTPClient] = None,
        session: Optional[SDNextSession] = None,
        storage: Optional[ImageStorage] = None,
    ) -> None:
        """Initialize SDNext backend."""
        self.timeout = settings.SDNEXT_TIMEOUT
        self.poll_interval = settings.SDNEXT_POLL_INTERVAL

        if session is not None:
            self._session = session
        else:
            delivery_client = http_client or DeliveryHTTPClient(
                settings.SDNEXT_BASE_URL,
                timeout=settings.SDNEXT_TIMEOUT,
                username=settings.SDNEXT_USERNAME,
                password=settings.SDNEXT_PASSWORD,
            )
            self._session = SDNextSession(delivery_client)

        self._storage = storage or FileSystemImageStorage(settings.SDNEXT_OUTPUT_DIR)

    async def close(self) -> None:
        """Close HTTP session."""
        await self._session.close()

    def is_available(self) -> bool:
        """Check if SDNext backend is configured and available."""
        return self._session.is_configured()

    async def generate_image(
        self, prompt: str, params: Dict[str, Any]
    ) -> SDNextGenerationResult:
        """Generate image using SDNext API."""
        job_id = str(uuid4())

        if not self.is_available():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext backend not configured",
            )

        if not await self._session.health_check():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext API not available",
            )

        gen_params = params.get("generation_params", {})
        save_images = params.get("save_images", True)
        return_format = params.get("return_format", "base64")

        submission = await self._session.submit_txt2img(prompt, gen_params)
        if not submission.ok:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=submission.error or "SDNext request failed",
            )

        payload = submission.data or {}
        images_payload = payload.get("images") or []

        try:
            images = await self._storage.persist_images(
                images_payload,
                job_id,
                save_images=save_images,
                return_format=return_format,
            )
        except Exception as exc:  # pragma: no cover - defensive
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )

        return SDNextGenerationResult(
            job_id=job_id,
            status="completed",
            images=images,
            progress=1.0,
            generation_info=payload.get("info", {}),
        )

    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        """Check generation progress."""
        if not self.is_available():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext backend not configured",
            )

        response = await self._session.get_progress()
        if not response.ok or response.data is None:
            return SDNextGenerationResult(
                job_id=job_id,
                status="unknown",
                error_message=response.error or "Could not check progress",
            )

        progress = response.data.get("progress", 0.0)
        status = "running" if progress < 1.0 else "completed"
        if progress == 0.0:
            status = "pending"

        return SDNextGenerationResult(
            job_id=job_id,
            status=status,
            progress=progress,
        )

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "sdnext"
