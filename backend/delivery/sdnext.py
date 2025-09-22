"""SDNext generation delivery implementation."""

import asyncio
from typing import Any, Dict, List, Optional
from uuid import uuid4

from backend.core.config import settings
from backend.schemas import SDNextGenerationResult

from .base import GenerationBackend
from .http_client import DeliveryHTTPClient
from .storage import FileSystemImageStorage, ImageStorage


class SDNextGenerationBackend(GenerationBackend):
    """SDNext generation backend implementation."""

    def __init__(
        self,
        http_client: Optional[DeliveryHTTPClient] = None,
        storage: Optional[ImageStorage] = None,
    ) -> None:
        """Initialize SDNext backend."""
        self.timeout = settings.SDNEXT_TIMEOUT
        self.poll_interval = settings.SDNEXT_POLL_INTERVAL

        self._http_client = http_client or DeliveryHTTPClient(
            settings.SDNEXT_BASE_URL,
            timeout=settings.SDNEXT_TIMEOUT,
            username=settings.SDNEXT_USERNAME,
            password=settings.SDNEXT_PASSWORD,
        )
        self._storage = storage or FileSystemImageStorage(settings.SDNEXT_OUTPUT_DIR)

    async def close(self) -> None:
        """Close HTTP session."""
        await self._http_client.close()

    def is_available(self) -> bool:
        """Check if SDNext backend is configured and available."""
        return self._http_client.is_configured()

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
        if not await self._http_client.health_check():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext API not available",
            )

        # Extract generation parameters
        gen_params = params.get("generation_params", {})
        params.get("mode", "immediate")
        save_images = params.get("save_images", True)
        return_format = params.get("return_format", "base64")

        # Prepare SDNext API payload
        payload = {
            "prompt": prompt,
            "negative_prompt": gen_params.get("negative_prompt", ""),
            "steps": gen_params.get("steps", settings.SDNEXT_DEFAULT_STEPS),
            "sampler_name": gen_params.get("sampler_name", settings.SDNEXT_DEFAULT_SAMPLER),
            "cfg_scale": gen_params.get("cfg_scale", settings.SDNEXT_DEFAULT_CFG_SCALE),
            "width": gen_params.get("width", 512),
            "height": gen_params.get("height", 512),
            "seed": gen_params.get("seed", -1),
            "batch_size": gen_params.get("batch_size", 1),
            "n_iter": gen_params.get("n_iter", 1),
        }

        if gen_params.get("denoising_strength") is not None:
            payload["denoising_strength"] = gen_params["denoising_strength"]

        try:
            request_ctx = await self._http_client.request(
                "POST",
                "/sdapi/v1/txt2img",
                json=payload,
            )

            async with request_ctx as response:
                if response.status != 200:
                    error_text = await response.text()
                    return SDNextGenerationResult(
                        job_id=job_id,
                        status="failed",
                        error_message=f"SDNext API error: {response.status} - {error_text}",
                    )

                result = await response.json()

                # Process images
                images: List[str] = []
                if "images" in result and result["images"]:
                    images = await self._process_images(
                        result["images"],
                        job_id,
                        save_images,
                        return_format,
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
            request_ctx = await self._http_client.request("GET", "/sdapi/v1/progress")

            async with request_ctx as response:
                if response.status != 200:
                    return SDNextGenerationResult(
                        job_id=job_id,
                        status="unknown",
                        error_message="Could not check progress",
                    )

                progress_data = await response.json()
                progress = progress_data.get("progress", 0.0)

                status = "running" if progress < 1.0 else "completed"
                if progress == 0.0:
                    status = "pending"

                return SDNextGenerationResult(
                    job_id=job_id,
                    status=status,
                    progress=progress,
                )

        except Exception as exc:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )

    async def _process_images(
        self,
        images: List[str],
        job_id: str,
        save_images: bool,
        return_format: str,
    ) -> List[str]:
        """Process generated images according to format and save options."""
        processed: List[str] = []

        for i, img_b64 in enumerate(images):
            try:
                if return_format == "base64":
                    processed.append(img_b64)
                elif return_format == "file_path" or save_images:
                    file_path = await self._storage.save_image(img_b64, job_id, i)
                    if return_format == "file_path":
                        processed.append(file_path)
                    else:
                        processed.append(img_b64)
                elif return_format == "url":
                    file_path = await self._storage.save_image(img_b64, job_id, i)
                    processed.append(f"file://{file_path}")
                else:
                    processed.append(img_b64)

            except Exception as exc:
                # Log error but continue with other images
                print(f"Error processing image {i}: {exc}")
                continue

        return processed

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "sdnext"
