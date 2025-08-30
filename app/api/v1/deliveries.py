"""HTTP routes for creating and querying delivery jobs."""

import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.delivery import get_delivery_backend, get_generation_backend
from app.schemas import (
    DeliveryCreate,
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
    SDNextGenerationParams,
)
from app.services import create_service_container

router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", None)


@router.post("/deliveries", status_code=201, response_model=DeliveryCreateResponse)
async def create_delivery(
    delivery: DeliveryCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Create a delivery job and either enqueue it or schedule a background task."""
    services = create_service_container(session)
    dj = services.deliveries.create_job(delivery.prompt, delivery.mode, delivery.params or {})
    
    if REDIS_URL:
        try:
            from app.workers.tasks import q
            # enqueue with delivery id
            q.enqueue("app.workers.tasks.process_delivery", dj.id)
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
def get_delivery(delivery_id: str, session: Session = Depends(get_session)):
    """Return the delivery job state for `delivery_id`."""
    services = create_service_container(session)
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


async def _process_delivery_fallback(job_id: str, prompt: str, mode: str, params: dict):
    """Fallback delivery processing when Redis is not available."""
    from app.core.database import get_session
    
    try:
        with get_session() as session:
            services = create_service_container(session)
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
            except Exception as exc:
                result = {"status": "failed", "error": str(exc)}
        else:
            result = {"status": "error", "detail": f"unknown mode: {mode}"}
        
        # Update job with result
        with get_session() as session:
            services = create_service_container(session)
            if result.get("status") in ("ok", "completed", 200):
                services.deliveries.update_job_status(job_id, "succeeded", result)
            else:
                services.deliveries.update_job_status(job_id, "failed", result)
                
    except Exception as exc:
        with get_session() as session:
            services = create_service_container(session)
            services.deliveries.update_job_status(
                job_id, 
                "failed", 
                {"error": str(exc)},
            )
