"""HTTP routes for live generation operations."""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_services
from backend.schemas import (
    ComposeRequest,
    GenerationMode,
    GenerationResultFormat,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import ServiceRegistry

from .controllers import live as controller

router = APIRouter()


@router.get("/backends", response_model=Dict[str, bool])
async def list_generation_backends():
    """List available generation backends and their status."""
    return controller.list_generation_backends()


@router.post("/generate", response_model=SDNextGenerationResult)
async def generate_image(
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    mode: GenerationMode = GenerationMode.IMMEDIATE,
    save_images: bool = True,
    return_format: GenerationResultFormat = GenerationResultFormat.BASE64,
    services: ServiceRegistry = Depends(get_services),
):
    """Generate an image using the specified backend."""
    return await controller.generate_image(
        generation_params=generation_params,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        services=services,
    )


@router.get("/progress/{job_id}", response_model=SDNextGenerationResult)
async def check_generation_progress(
    job_id: str,
    backend: str = "sdnext",
):
    """Check the progress of a generation job."""
    return await controller.check_generation_progress(job_id=job_id, backend=backend)


@router.post("/compose-and-generate", response_model=SDNextGenerationResult)
async def compose_and_generate(
    compose_request: ComposeRequest,
    generation_params: SDNextGenerationParams,
    backend: str = "sdnext",
    mode: GenerationMode = GenerationMode.IMMEDIATE,
    save_images: bool = True,
    return_format: GenerationResultFormat = GenerationResultFormat.BASE64,
    services: ServiceRegistry = Depends(get_services),
):
    """Compose LoRA prompt and immediately generate images."""
    return await controller.compose_and_generate(
        compose_request=compose_request,
        generation_params=generation_params,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        services=services,
    )
