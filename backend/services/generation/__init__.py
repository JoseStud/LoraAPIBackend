"""Generation service and helpers for SDNext integration."""

from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks

from backend.delivery import get_generation_backend
from backend.models import DeliveryJob
from backend.schemas import (
    GenerationStarted,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services.deliveries import DeliveryService
from backend.services.websocket import WebSocketService

from .statuses import normalize_status


def normalize_generation_status(status: Optional[str]) -> str:
    """Convert a delivery/job status into the UI vocabulary."""
    return normalize_status(status).value


class GenerationService:
    """Service for image generation operations."""

    def __init__(self):
        """Initialize GenerationService."""
        pass

    @staticmethod
    def _with_normalized_status(
        result: SDNextGenerationResult,
    ) -> SDNextGenerationResult:
        normalized_status = normalize_generation_status(result.status)
        if normalized_status == result.status:
            return result

        return result.model_copy(update={"status": normalized_status})

    async def generate_image(
        self,
        prompt: str,
        backend_name: str = "sdnext",
        generation_params: Optional[SDNextGenerationParams] = None,
        **kwargs,
    ) -> SDNextGenerationResult:
        """Generate an image using the specified backend.
        
        Args:
            prompt: The prompt to generate from
            backend_name: Name of the generation backend
            generation_params: Generation parameters
            **kwargs: Additional backend-specific parameters
            
        Returns:
            SDNextGenerationResult with generation status and results

        """
        try:
            backend = get_generation_backend(backend_name)
        except ValueError as e:
            return SDNextGenerationResult(
                job_id="unknown",
                status="failed",
                error_message=str(e),
            )
        
        # Prepare parameters
        params = kwargs.copy()
        if generation_params:
            params["generation_params"] = generation_params.model_dump()
        
        backend_result = await backend.generate_image(prompt, params)
        return self._with_normalized_status(backend_result)

    async def check_generation_progress(
        self, 
        job_id: str, 
        backend_name: str = "sdnext",
    ) -> SDNextGenerationResult:
        """Check the progress of a generation job.
        
        Args:
            job_id: Generation job ID
            backend_name: Name of the generation backend
            
        Returns:
            SDNextGenerationResult with current status

        """
        try:
            backend = get_generation_backend(backend_name)
        except ValueError as e:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(e),
            )
        
        backend_result = await backend.check_progress(job_id)
        return self._with_normalized_status(backend_result)

    async def list_available_backends(self) -> Dict[str, bool]:
        """List available generation backends and their status.
        
        Returns:
            Dict mapping backend names to availability status

        """
        from backend.delivery.base import delivery_registry
        
        backends_info = delivery_registry.list_available_backends()
        return backends_info.get("generation", {})

    async def validate_generation_params(
        self, 
        params: SDNextGenerationParams,
    ) -> List[str]:
        """Validate generation parameters and return warnings.
        
        Args:
            params: Generation parameters to validate
            
        Returns:
            List of validation warning messages

        """
        warnings = []
        
        # Check prompt
        if not params.prompt.strip():
            warnings.append("Empty prompt provided")
        
        # Check dimensions
        if params.width <= 0 or params.height <= 0:
            warnings.append("Invalid image dimensions")
        elif params.width * params.height > 2048 * 2048:
            warnings.append("Very large image dimensions may cause memory issues")
        
        # Check steps
        if params.steps < 1:
            warnings.append("Steps must be at least 1")
        elif params.steps > 100:
            warnings.append("High step count may take very long to generate")
        
        # Check CFG scale
        if params.cfg_scale < 1.0:
            warnings.append("CFG scale below 1.0 may produce poor results")
        elif params.cfg_scale > 20.0:
            warnings.append("Very high CFG scale may cause artifacts")
        
        # Check batch size
        if params.batch_size < 1:
            warnings.append("Batch size must be at least 1")
        elif params.batch_size > 8:
            warnings.append("Large batch size may cause memory issues")
        
        return warnings

    def get_default_params(self) -> SDNextGenerationParams:
        """Get default generation parameters.
        
        Returns:
            SDNextGenerationParams with default values

        """
        from backend.core.config import settings

        return SDNextGenerationParams(
            prompt="",
            steps=settings.SDNEXT_DEFAULT_STEPS,
            sampler_name=settings.SDNEXT_DEFAULT_SAMPLER,
            cfg_scale=settings.SDNEXT_DEFAULT_CFG_SCALE,
        )


class GenerationCoordinator:
    """Helper responsible for coordinating generation job lifecycles."""

    def __init__(
        self,
        deliveries: DeliveryService,
        websocket: WebSocketService,
        generation_service: GenerationService,
    ) -> None:
        self._deliveries = deliveries
        self._websocket = websocket
        self._generation_service = generation_service

    def schedule_generation_job(
        self,
        generation_params: SDNextGenerationParams,
        *,
        backend: str = "sdnext",
        mode: str = "deferred",
        save_images: bool = True,
        return_format: str = "base64",
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> DeliveryJob:
        """Create and enqueue a generation delivery job."""
        delivery_params = {
            "generation_params": generation_params.model_dump(),
            "mode": mode,
            "save_images": save_images,
            "return_format": return_format,
            "backend": backend,
        }

        schedule_kwargs: Dict[str, Any] = dict(enqueue_kwargs)
        if background_tasks is not None:
            schedule_kwargs["background_tasks"] = background_tasks

        return self._deliveries.schedule_job(
            prompt=generation_params.prompt,
            mode=backend,
            params=delivery_params,
            **schedule_kwargs,
        )

    def serialize_delivery_job(self, job: DeliveryJob) -> Dict[str, Any]:
        """Return normalized parameters and result payload data for a job."""
        raw_params = self._deliveries.get_job_params(job)
        backend_name: Optional[str] = None
        generation_params: Dict[str, Any] = {}
        if isinstance(raw_params, dict):
            maybe_backend = raw_params.get("backend")
            if isinstance(maybe_backend, str):
                backend_name = maybe_backend

            maybe_generation_params = raw_params.get("generation_params")
            if isinstance(maybe_generation_params, dict):
                generation_params = dict(maybe_generation_params)
            else:
                generation_params = dict(raw_params)

        if not backend_name and isinstance(job.mode, str):
            backend_name = job.mode

        if backend_name:
            generation_params.setdefault("backend", backend_name)

        result_payload = self._deliveries.get_job_result(job) or {}
        if not isinstance(result_payload, dict):
            result_payload = {}

        progress_value = result_payload.get("progress")
        progress = 0.0
        if isinstance(progress_value, (int, float)):
            progress = float(progress_value)
            if progress <= 1:
                progress *= 100

        message: Optional[str] = None
        for key in ("message", "detail"):
            value = result_payload.get(key)
            if isinstance(value, str):
                message = value
                break

        error_text: Optional[str] = None
        for key in ("error", "error_message"):
            value = result_payload.get(key)
            if isinstance(value, str):
                error_text = value
                break

        return {
            "params": generation_params,
            "result": result_payload,
            "progress": progress,
            "message": message,
            "error": error_text,
        }

    async def broadcast_job_started(
        self, job_id: str, generation_params: SDNextGenerationParams,
    ) -> None:
        """Kick off monitoring and fan out job start notifications."""
        await self._websocket.start_job_monitoring(job_id, self._generation_service)

        started_notification = GenerationStarted(
            job_id=job_id,
            params=generation_params,
        )
        await self._websocket.manager.broadcast_generation_started(
            job_id,
            started_notification,
        )
