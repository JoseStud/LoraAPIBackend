"""Controllers for live generation endpoints."""

from __future__ import annotations

from typing import Dict

import structlog
from fastapi import HTTPException

from backend.delivery import get_generation_backend
from backend.schemas import (
    ComposeRequest,
    GenerationMode,
    GenerationResultFormat,
    SDNextGenerationParams,
    SDNextGenerationResult,
)
from backend.services import ApplicationServices, DomainServices
from backend.services.generation import normalize_generation_status

logger = structlog.get_logger(__name__)

__all__ = [
    "list_generation_backends",
    "generate_image",
    "compose_and_generate",
    "check_generation_progress",
]


async def _execute_generation_request(
    *,
    generation_params: SDNextGenerationParams,
    backend: str,
    mode: GenerationMode,
    save_images: bool,
    return_format: GenerationResultFormat,
    domain: DomainServices,
    application: ApplicationServices,
) -> SDNextGenerationResult:
    """Validate and orchestrate a generation request."""
    warnings = await domain.generation.validate_generation_params(generation_params)
    if warnings:
        logger.warning(
            "generation parameter validation warnings",
            warnings=warnings,
            backend=backend,
            mode=mode.value,
        )

    params = {
        "mode": mode.value,
        "save_images": save_images,
        "return_format": return_format.value,
    }

    result = await domain.generation.generate_image(
        generation_params.prompt,
        backend,
        generation_params,
        **params,
    )

    if result.job_id and mode == GenerationMode.DEFERRED:
        await application.generation_coordinator.broadcast_job_started(
            result.job_id,
            generation_params,
        )

    return result


def list_generation_backends() -> Dict[str, bool]:
    """List available generation backends and their status."""
    from backend.delivery.base import delivery_registry

    backends_info = delivery_registry.list_available_backends()
    return backends_info.get("generation", {})


async def generate_image(
    *,
    generation_params: SDNextGenerationParams,
    backend: str,
    mode: GenerationMode,
    save_images: bool,
    return_format: GenerationResultFormat,
    domain: DomainServices,
    application: ApplicationServices,
) -> SDNextGenerationResult:
    """Generate an image using the specified backend."""
    return await _execute_generation_request(
        generation_params=generation_params,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        domain=domain,
        application=application,
    )


async def compose_and_generate(
    *,
    compose_request: ComposeRequest,
    generation_params: SDNextGenerationParams,
    backend: str,
    mode: GenerationMode,
    save_images: bool,
    return_format: GenerationResultFormat,
    domain: DomainServices,
    application: ApplicationServices,
) -> SDNextGenerationResult:
    """Compose a prompt and immediately generate images."""
    composition = domain.compose.compose_from_adapter_service(
        domain.adapters,
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
            mode=mode.value,
        )

    composed_params = generation_params.model_copy(
        update={"prompt": composition.prompt}
    )

    return await _execute_generation_request(
        generation_params=composed_params,
        backend=backend,
        mode=mode,
        save_images=save_images,
        return_format=return_format,
        domain=domain,
        application=application,
    )


async def check_generation_progress(
    *,
    job_id: str,
    backend: str,
) -> SDNextGenerationResult:
    """Check the progress of a generation job."""
    try:
        generation_backend = get_generation_backend(backend)
    except ValueError as exc:
        raise HTTPException(
            status_code=404, detail=f"Backend '{backend}' not found"
        ) from exc

    result = await generation_backend.check_progress(job_id)
    normalized_status = normalize_generation_status(result.status)
    if normalized_status != result.status:
        result = result.model_copy(update={"status": normalized_status})
    return result
