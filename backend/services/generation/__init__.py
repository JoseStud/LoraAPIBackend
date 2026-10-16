"""Generation service and helpers for SDNext integration."""

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.delivery import get_delivery_registry, get_generation_backend
from backend.models import DeliveryJob
from backend.schemas import (
    DeliveryJobResult,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services.deliveries import DeliveryService
from backend.services.queue import TaskScheduler

from .statuses import NormalizedGenerationStatus, normalize_status

TERMINAL_JOB_STATUSES = frozenset({"succeeded", "failed", "cancelled"})
"""Delivery statuses a job never leaves."""


class GenerationWaitTimeout(Exception):
    """A blocking generation request stopped waiting for its job.

    The job itself is not affected: it stays queued or running and can be
    followed at ``/v1/generation/jobs/{job_id}``.
    """

    def __init__(self, job_id: str, timeout_seconds: float) -> None:
        """Record which job was still unfinished after ``timeout_seconds``."""
        super().__init__(
            f"Generation job {job_id} did not finish within {timeout_seconds:g}s"
        )
        self.job_id = job_id
        self.timeout_seconds = timeout_seconds


def normalize_generation_status(status: Optional[str]) -> str:
    """Convert a delivery/job status into the UI vocabulary."""
    return normalize_status(status).value


class GenerationService:
    """Service for image generation operations."""

    @staticmethod
    def _with_normalized_status(
        result: SDNextGenerationResult,
    ) -> SDNextGenerationResult:
        normalized_status = normalize_generation_status(result.status)
        if normalized_status == result.status:
            return result

        return result.model_copy(update={"status": normalized_status})

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

    async def interrupt(self, backend_name: str = "sdnext") -> bool:
        """Stop the generation ``backend_name`` is running, if it can."""
        try:
            backend = get_generation_backend(backend_name)
        except ValueError:
            return False
        return await backend.interrupt()

    async def list_available_backends(self) -> Dict[str, bool]:
        """List available generation backends and their status.

        Returns:
            Dict mapping backend names to availability status

        """
        backends_info = get_delivery_registry().list_available_backends()
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


@dataclass(frozen=True)
class SerializedGenerationJob:
    """A generation job's stored params and result as the API presents them."""

    params: Dict[str, Any]
    """Generation parameters, with ``backend`` filled from the job's mode."""
    result: DeliveryJobResult
    """The stored result; empty when the job has none yet."""
    progress: float
    """Stored progress as a fraction; 1.0 once the job completed."""
    message: Optional[str] = None
    error: Optional[str] = None


class GenerationCoordinator:
    """Helper responsible for coordinating generation job lifecycles."""

    def __init__(
        self,
        deliveries: DeliveryService,
        generation_service: GenerationService,
    ) -> None:
        """Store dependencies used to orchestrate generation jobs."""
        self._deliveries = deliveries
        self._generation_service = generation_service

    def schedule_generation_job(
        self,
        generation_params: SDNextGenerationParams,
        *,
        backend: str = "sdnext",
        mode: str = "deferred",
        save_images: bool = True,
        return_format: str = "base64",
        background_tasks: Optional[TaskScheduler] = None,
        client_ref: Optional[str] = None,
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
        if client_ref:
            delivery_params["client_ref"] = client_ref

        schedule_kwargs: Dict[str, Any] = dict(enqueue_kwargs)
        if background_tasks is not None:
            schedule_kwargs["background_tasks"] = background_tasks

        return self._deliveries.schedule_job(
            prompt=generation_params.prompt,
            mode=backend,
            params=delivery_params,
            **schedule_kwargs,
        )

    async def wait_for_job(
        self,
        job_id: str,
        *,
        timeout_seconds: float,
        poll_interval_seconds: float,
    ) -> Optional[DeliveryJob]:
        """Wait until ``job_id`` reaches a terminal status and return it.

        The job row is re-read in a worker thread every
        ``poll_interval_seconds``, so the event loop stays free while the
        queue (RQ worker or in-process runner) runs the job. Returns ``None``
        when the job no longer exists. Raises :class:`GenerationWaitTimeout`
        when it is still unfinished after ``timeout_seconds``; the job keeps
        running.
        """
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds
        while True:
            job = await asyncio.to_thread(
                self._deliveries.get_job, job_id, refresh=True
            )
            if job is None or job.status in TERMINAL_JOB_STATUSES:
                return job
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise GenerationWaitTimeout(job_id, timeout_seconds)
            await asyncio.sleep(min(poll_interval_seconds, remaining))

    def serialize_delivery_job(self, job: DeliveryJob) -> SerializedGenerationJob:
        """Return a job's generation parameters and stored result, normalised."""
        params = self._deliveries.get_job_params(job)
        generation_params = params.generation_fields()
        backend_name = params.backend or job.mode
        if backend_name:
            generation_params.setdefault("backend", backend_name)

        result = self._deliveries.get_job_result(job) or DeliveryJobResult()

        # The same rule as the progress WebSocket (``JobProgressMonitor``): the
        # stored value, and 1.0 once the job completed.
        progress = result.progress or 0.0
        if normalize_status(job.status) is NormalizedGenerationStatus.COMPLETED:
            progress = 1.0

        return SerializedGenerationJob(
            params=generation_params,
            result=result,
            progress=progress,
            message=result.status_message,
            error=result.error_message or None,
        )

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel an active job; ``False`` when it is not active.

        A running job's generation is interrupted too. The runner then finds
        the job cancelled and discards whatever the backend returns, and the
        progress monitor stops reporting the job without a completion message.
        """
        previous_status = await asyncio.to_thread(self._deliveries.cancel_job, job_id)
        if previous_status is None:
            return False

        if previous_status == "running":
            job = await asyncio.to_thread(self._deliveries.get_job, job_id)
            backend_name = job.mode if job is not None else "sdnext"
            await self._generation_service.interrupt(backend_name)
        return True
