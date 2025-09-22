"""SDNext generation delivery implementation."""

import asyncio
from typing import Any, Dict, Optional
from uuid import uuid4

from backend.core.config import settings
from backend.schemas import SDNextGenerationResult

from .base import GenerationBackend
from .http_client import DeliveryHTTPClient
from .image_persistence import ImagePersistence
from .sdnext_client import SDNextClient, SDNextClientError
from .storage import FileSystemImageStorage, ImageStorage


class SDNextGenerationBackend(GenerationBackend):
    """SDNext generation backend implementation."""

    def __init__(
        self,
        http_client: Optional[DeliveryHTTPClient] = None,
        storage: Optional[ImageStorage] = None,
        *,
        client: Optional[SDNextClient] = None,
        image_persistence: Optional[ImagePersistence] = None,
    ) -> None:
        """Initialize SDNext backend."""
        self.timeout = settings.SDNEXT_TIMEOUT
        self.poll_interval = settings.SDNEXT_POLL_INTERVAL

        if client is not None:
            self._client = client
        else:
            delivery_client = http_client or DeliveryHTTPClient(
                settings.SDNEXT_BASE_URL,
                timeout=settings.SDNEXT_TIMEOUT,
                username=settings.SDNEXT_USERNAME,
                password=settings.SDNEXT_PASSWORD,
            )
            self._client = SDNextClient(delivery_client)

        if image_persistence is not None:
            self._image_persistence = image_persistence
        else:
            storage_backend = storage
            if storage_backend is None:
                storage_backend = FileSystemImageStorage(settings.SDNEXT_OUTPUT_DIR)
            self._image_persistence = ImagePersistence(storage_backend)

    async def close(self) -> None:
        """Close HTTP session."""
        await self._client.close()

    def is_available(self) -> bool:
        """Check if SDNext backend is configured and available."""
        return self._client.is_configured()

    async def generate_image(self, prompt: str, params: Dict[str, Any]) -> SDNextGenerationResult:
        """Generate image using SDNext API."""
        job_id = str(uuid4())

        if not self.is_available():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext backend not configured",
            )

        # Check if API is available
        if not await self._client.health_check():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext API not available",
            )

        # Extract generation parameters
        gen_params = params.get("generation_params", {})
        save_images = params.get("save_images", True)
        return_format = params.get("return_format", "base64")

        try:
            result = await self._client.submit_txt2img(prompt, gen_params)

            images = []
            if "images" in result and result["images"]:
                images = await self._image_persistence.persist_images(
                    result["images"],
                    job_id,
                    save_images=save_images,
                    return_format=return_format,
                )

            return SDNextGenerationResult(
                job_id=job_id,
                status="completed",
                images=images,
                progress=1.0,
                generation_info=result.get("info", {}),
            )

        except asyncio.TimeoutError:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=f"Generation timeout after {self.timeout}s",
            )
        except SDNextClientError as exc:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )
        except Exception as exc:  # pragma: no cover - defensive
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )

    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        """Check generation progress."""
        if not self.is_available():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext backend not configured",
            )

        try:
            progress_data = await self._client.get_progress()
            progress = progress_data.get("progress", 0.0)

            status = "running" if progress < 1.0 else "completed"
            if progress == 0.0:
                status = "pending"

            return SDNextGenerationResult(
                job_id=job_id,
                status=status,
                progress=progress,
            )

        except SDNextClientError:
            return SDNextGenerationResult(
                job_id=job_id,
                status="unknown",
                error_message="Could not check progress",
            )
        except Exception as exc:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "sdnext"
