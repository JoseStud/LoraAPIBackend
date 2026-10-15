"""SDNext generation delivery implementation."""

from __future__ import annotations

import asyncio
import json
import logging
import shlex
from typing import Any, Dict, Optional
from uuid import uuid4

from backend.core.config import settings
from backend.schemas import SDNextGenerationResult

from .base import GenerationBackend
from .http_client import DeliveryHTTPClient
from .sdnext_client import SDNextSession
from .storage import FileSystemImageStorage, ImageStorage

logger = logging.getLogger(__name__)


async def run_pre_generate_command() -> None:
    """Run SDNEXT_PRE_GENERATE_COMMAND and wait for it, if one is configured.

    Generation still goes ahead when the command fails or times out; the
    command is a safeguard (such as freeing the GPU), not a requirement.
    """
    command = (settings.SDNEXT_PRE_GENERATE_COMMAND or "").strip()
    if not command:
        return

    try:
        process = await asyncio.create_subprocess_exec(
            *shlex.split(command),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
    except (OSError, ValueError) as exc:
        logger.warning("Pre-generate command could not start (%s): %s", command, exc)
        return

    try:
        _, stderr = await asyncio.wait_for(
            process.communicate(), timeout=settings.SDNEXT_PRE_GENERATE_TIMEOUT
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        logger.warning("Pre-generate command timed out: %s", command)
        return

    if process.returncode != 0:
        logger.warning(
            "Pre-generate command exited with %s: %s %s",
            process.returncode,
            command,
            (stderr or b"").decode(errors="replace").strip(),
        )


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

        await run_pre_generate_command()
        submission = await self._session.submit_txt2img(prompt, gen_params)
        if not submission.ok:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=submission.error or "SDNext request failed",
            )

        payload = submission.data or {}
        images_payload = payload.get("images") or []
        generation_info = payload.get("info", {})
        try:
            if isinstance(generation_info, str):
                generation_info = json.loads(generation_info)
            if not isinstance(generation_info, dict) or not isinstance(
                images_payload, list
            ):
                raise ValueError("Invalid response shape")
            if not all(isinstance(image, str) for image in images_payload):
                raise ValueError("Missing image data")
        except (ValueError, TypeError):
            logger.exception("Invalid SDNext generation payload")
            return SDNextGenerationResult(
                job_id=job_id, status="failed", error_message="Invalid SDNext response"
            )

        if not images_payload:
            # SD.Next answers 200 with no images when it aborts a job, e.g. the
            # model is still loading or the GPU ran out of memory.
            logger.warning("SDNext returned no images: %s", generation_info)
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=(
                    "SD.Next returned no images (model still loading or out of "
                    "GPU memory?); see the SD.Next log"
                ),
                generation_info=generation_info or None,
            )

        try:
            images = await self._storage.persist_images(
                images_payload,
                job_id,
                save_images=save_images,
                return_format=return_format,
            )
        except Exception:
            logger.exception("Failed to persist SDNext images")
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="Could not save generated images",
            )

        return SDNextGenerationResult(
            job_id=job_id,
            status="completed",
            images=images,
            progress=1.0,
            generation_info=generation_info,
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

    async def interrupt(self) -> bool:
        """Stop SDNext's current generation.

        SDNext runs one generation at a time and its interrupt is
        process-global, so this stops whatever it is rendering right now.
        """
        if not self.is_available():
            return False
        response = await self._session.interrupt()
        return response.ok

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "sdnext"
