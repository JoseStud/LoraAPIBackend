"""HTTP routes for blocking generation and per-job progress."""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_services
from backend.schemas import (
    ComposeRequest,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import ServiceRegistry

from .controllers import live as controller

router = APIRouter()

_BLOCKING_RESPONSES = {
    504: {
        "description": (
            "The job did not finish within GENERATION_WAIT_TIMEOUT_SECONDS. It "
            "keeps running; the problem detail's `job_id` and `job_url` point "
            "at /v1/generation/jobs/{job_id}."
        )
    },
    503: {"description": "The job queue (Redis) rejected the job."},
}


@router.get("/backends", response_model=Dict[str, bool])
def list_generation_backends():
    """List available generation backends and their status."""
    return controller.list_generation_backends()


@router.post(
    "/generate",
    response_model=SDNextGenerationResult,
    responses=_BLOCKING_RESPONSES,
)
async def generate_image(
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    services: ServiceRegistry = Depends(get_services),
):
    """Queue a generation job and wait for its result.

    The job runs on the generation queue like ``/queue-generation``; this
    request only waits for it. ``job_id`` in the response is the job's id and
    ``images`` are result image URLs. A failed or cancelled job answers 200
    with ``status`` ``failed`` and its ``error_message``.
    """
    return await controller.generate_image(
        generation_params=generation_params,
        backend=backend,
        services=services,
    )


@router.get("/progress/{job_id}", response_model=SDNextGenerationResult)
async def check_generation_progress(
    job_id: str,
    services: ServiceRegistry = Depends(get_services),
):
    """Report a generation job's status and progress (a 0–1 fraction)."""
    return await controller.check_generation_progress(job_id=job_id, services=services)


@router.post(
    "/compose-and-generate",
    response_model=SDNextGenerationResult,
    responses=_BLOCKING_RESPONSES,
)
async def compose_and_generate(
    compose_request: ComposeRequest,
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    services: ServiceRegistry = Depends(get_services),
):
    """Compose the active adapters into the prompt, then generate as ``/generate``."""
    return await controller.compose_and_generate(
        compose_request=compose_request,
        generation_params=generation_params,
        backend=backend,
        services=services,
    )
