"""HTTP routes for creating and querying delivery jobs."""

import asyncio
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from backend.core.database import get_session_context
from backend.core.dependencies import get_service_container
from backend.delivery import get_delivery_backend, get_generation_backend
from backend.schemas import (
    DeliveryCreate,
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
    SDNextGenerationParams,
)
from backend.services import ServiceContainer

router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", None)


@router.post("/deliveries", status_code=201, response_model=DeliveryCreateResponse)
async def create_delivery(
    delivery: DeliveryCreate,
    background_tasks: BackgroundTasks,
    services: ServiceContainer = Depends(get_service_container),
):
    """Create a delivery job and either enqueue it or schedule a background task."""
    dj = services.deliveries.create_job(delivery.prompt, delivery.mode, delivery.params or {})
    
    if REDIS_URL:
        try:
            from backend.workers.tasks import q
            # enqueue with delivery id
            q.enqueue("backend.workers.tasks.process_delivery", dj.id)
        except Exception:
            # fallback to BackgroundTasks
            background_tasks.add_task(
                _process_delivery_fallback,
                dj.id,
                delivery.prompt,
                delivery.mode,
                delivery.params or {},
            )
    else:
        # no redis configured, run via BackgroundTasks as before
        background_tasks.add_task(
            _process_delivery_fallback,
            dj.id,
            delivery.prompt,
            delivery.mode,
            delivery.params or {},
        )

    return DeliveryCreateResponse(delivery_id=dj.id)


@router.get("/deliveries/{delivery_id}", response_model=DeliveryWrapper)
def get_delivery(
    delivery_id: str,
    services: ServiceContainer = Depends(get_service_container),
):
    """Return the delivery job state for `delivery_id`."""
    dj = services.deliveries.get_job(delivery_id)
    
    if not dj:
        raise HTTPException(status_code=404, detail="delivery not found")
    
    # Convert to read model
    delivery_read = DeliveryRead(
        id=dj.id,
        prompt=dj.prompt,
        mode=dj.mode,
        params=services.deliveries.get_job_params(dj),
        status=dj.status,
        result=services.deliveries.get_job_result(dj),
        created_at=dj.created_at,
        started_at=dj.started_at,
        finished_at=dj.finished_at,
    )
    
    return DeliveryWrapper(delivery=delivery_read)


def _process_delivery_fallback(job_id: str, prompt: str, mode: str, params: dict) -> None:
    """Fallback delivery processing when Redis is not available."""
    asyncio.run(_process_delivery_fallback_async(job_id, prompt, mode, params))


async def _process_delivery_fallback_async(job_id: str, prompt: str, mode: str, params: dict) -> None:
    try:
        with get_session_context() as session:
            services = ServiceContainer(session)
            services.deliveries.update_job_status(job_id, "running")

        # Process based on mode
        if mode == "http":
            backend = get_delivery_backend("http")
            result = await backend.deliver(prompt, params)
        elif mode == "cli":
            backend = get_delivery_backend("cli")
            result = await backend.deliver(prompt, params)
        elif mode == "sdnext":
            backend = get_generation_backend("sdnext")

            # Extract generation parameters
            gen_params_dict = params.get("generation_params", {})
            gen_params_dict["prompt"] = prompt

            try:
                gen_params = SDNextGenerationParams(**gen_params_dict)
                full_params = {
                    "generation_params": gen_params.model_dump(),
                    "mode": params.get("mode", "immediate"),
                    "save_images": params.get("save_images", True),
                    "return_format": params.get("return_format", "base64"),
                }
                result_obj = await backend.generate_image(prompt, full_params)
                result = result_obj.model_dump()
            except Exception as exc:  # pragma: no cover - defensive branch
                result = {"status": "failed", "error": str(exc)}
        else:
            result = {"status": "error", "detail": f"unknown mode: {mode}"}

        # Update job with result
        with get_session_context() as session:
            services = ServiceContainer(session)
            if result.get("status") in ("ok", "completed", 200):
                services.deliveries.update_job_status(job_id, "succeeded", result)
            else:
                services.deliveries.update_job_status(job_id, "failed", result)

    except Exception as exc:  # pragma: no cover - background logging path
        with get_session_context() as session:
            services = ServiceContainer(session)
            services.deliveries.update_job_status(
                job_id,
                "failed",
                {"error": str(exc)},
            )
