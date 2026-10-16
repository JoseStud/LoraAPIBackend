"""Controllers for blocking generation endpoints.

``/generate`` and ``/compose-and-generate`` answer only once the image is
rendered, but they never call the generation backend themselves: each
request creates a delivery job through the same path as
``/queue-generation`` and waits for the queue (the RQ worker, or the
in-process runner without Redis) to finish it. SD.Next renders one job at a
time and its progress and interrupt endpoints are global, so every render
goes through the one queue, and every render has a job row for the progress
monitor, job recovery and cancellation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

import structlog
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.core.config import settings
from backend.delivery import get_delivery_registry
from backend.delivery.storage import REFERENCE_FORMAT
from backend.models import DeliveryJob
from backend.schemas import (
    ComposeRequest,
    GenerationMode,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import ServiceRegistry
from backend.services.generation import SerializedGenerationJob
from backend.utils.progress import to_progress_fraction

from ..presenters.jobs import build_generation_result

logger = structlog.get_logger(__name__)

__all__ = [
    "list_generation_backends",
    "generate_image",
    "compose_and_generate",
    "check_generation_progress",
]


def list_generation_backends() -> Dict[str, bool]:
    """List available generation backends and their status."""
    backends_info = get_delivery_registry().list_available_backends()
    return backends_info.get("generation", {})


def _schedule_job(
    services: ServiceRegistry,
    generation_params: SDNextGenerationParams,
    backend: str,
) -> str:
    """Create and enqueue the job; return its id.

    Images are always saved and stored as output references, so the response
    carries URLs of the result image route rather than image data.
    """
    job = services.generation_coordinator.schedule_generation_job(
        generation_params,
        backend=backend,
        mode=GenerationMode.IMMEDIATE.value,
        save_images=True,
        return_format=REFERENCE_FORMAT,
    )
    return job.id


def _present_job(services: ServiceRegistry, job: DeliveryJob) -> SDNextGenerationResult:
    serialized = services.generation_coordinator.serialize_delivery_job(job)
    return build_generation_result(job, serialized)


async def _generate_through_queue(
    *,
    generation_params: SDNextGenerationParams,
    backend: str,
    services: ServiceRegistry,
) -> SDNextGenerationResult:
    """Queue a generation job, wait for it to finish and return its result.

    Raises ``GenerationWaitTimeout`` (answered as 504 naming the job) when the
    job is still unfinished after ``generation_wait_timeout_seconds``, and
    ``QueueUnavailableError`` (503) when the queue rejects it.
    """
    warnings = await services.generation.validate_generation_params(generation_params)
    if warnings:
        logger.warning(
            "generation parameter validation warnings",
            warnings=warnings,
            backend=backend,
        )

    job_id = await run_in_threadpool(
        _schedule_job, services, generation_params, backend
    )
    job = await services.generation_coordinator.wait_for_job(
        job_id,
        timeout_seconds=settings.generation_wait_timeout_seconds,
        poll_interval_seconds=settings.SDNEXT_POLL_INTERVAL,
    )
    if job is None:
        # Deleted while it was waiting.
        raise HTTPException(status_code=404, detail="Job not found")
    return await run_in_threadpool(_present_job, services, job)


async def generate_image(
    *,
    generation_params: SDNextGenerationParams,
    backend: str,
    services: ServiceRegistry,
) -> SDNextGenerationResult:
    """Generate images through the queue and wait for the result."""
    return await _generate_through_queue(
        generation_params=generation_params,
        backend=backend,
        services=services,
    )


async def compose_and_generate(
    *,
    compose_request: ComposeRequest,
    generation_params: SDNextGenerationParams,
    backend: str,
    services: ServiceRegistry,
) -> SDNextGenerationResult:
    """Compose a prompt from the active adapters, then generate as ``/generate``."""
    composition = await run_in_threadpool(
        services.compose.compose_from_adapter_service,
        services.adapters,
        prefix=compose_request.prefix or "",
        suffix=compose_request.suffix or "",
    )

    if not composition.tokens:
        raise HTTPException(status_code=400, detail="No active adapters found")

    if composition.warnings:
        logger.warning(
            "composition warnings during compose-and-generate",
            warnings=composition.warnings,
            backend=backend,
        )

    composed_params = generation_params.model_copy(
        update={"prompt": composition.prompt}
    )

    return await _generate_through_queue(
        generation_params=composed_params,
        backend=backend,
        services=services,
    )


@dataclass(frozen=True)
class _ProgressState:
    job: DeliveryJob
    serialized: SerializedGenerationJob
    backend: str
    is_rendering: bool
    """Whether SD.Next's global progress belongs to this job."""


def _load_progress_state(
    services: ServiceRegistry, job_id: str
) -> Optional[_ProgressState]:
    job = services.deliveries.get_job(job_id, refresh=True)
    if job is None:
        return None
    serialized = services.generation_coordinator.serialize_delivery_job(job)

    # As in the progress monitor: of the running jobs, SD.Next is rendering
    # the most recently started one.
    is_rendering = False
    if job.status == "running":
        running = services.deliveries.list_jobs_by_statuses(("running",), limit=1)
        is_rendering = bool(running) and running[0].id == job.id

    backend = serialized.params.get("backend") or job.mode or "sdnext"
    return _ProgressState(
        job=job,
        serialized=serialized,
        backend=str(backend),
        is_rendering=is_rendering,
    )


async def _read_live_progress(
    services: ServiceRegistry, job_id: str, backend: str
) -> Optional[float]:
    try:
        live = await services.generation.check_generation_progress(job_id, backend)
    except Exception as exc:
        logger.warning(
            "Could not read live generation progress", job_id=job_id, error=str(exc)
        )
        return None
    return to_progress_fraction(live.progress)


async def check_generation_progress(
    *,
    job_id: str,
    services: ServiceRegistry,
) -> SDNextGenerationResult:
    """Report one job's status and progress from its job row.

    Progress follows the REST queue's rule (the stored fraction, 1.0 once
    completed). Only while the job is the one SD.Next is rendering and has
    stored no progress does SD.Next's live progress fill in.
    """
    state = await run_in_threadpool(_load_progress_state, services, job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found")

    live_progress: Optional[float] = None
    if state.is_rendering and state.serialized.result.progress is None:
        live_progress = await _read_live_progress(services, job_id, state.backend)

    return await run_in_threadpool(
        build_generation_result,
        state.job,
        state.serialized,
        live_progress=live_progress,
    )
