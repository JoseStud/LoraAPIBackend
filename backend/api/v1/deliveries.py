"""HTTP routes for creating and querying delivery jobs."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from backend.core.dependencies import get_application_services
from backend.schemas import (
    DeliveryCreate,
    DeliveryCreateResponse,
    DeliveryRead,
    DeliveryWrapper,
)
from backend.services import ApplicationServices

router = APIRouter()


@router.post("/deliveries", status_code=201, response_model=DeliveryCreateResponse)
async def create_delivery(
    delivery: DeliveryCreate,
    background_tasks: BackgroundTasks,
    services: ApplicationServices = Depends(get_application_services),
):
    """Create a delivery job and either enqueue it or schedule a background task."""
    job = services.deliveries.schedule_job(
        delivery.prompt,
        delivery.mode,
        delivery.params or {},
        background_tasks=background_tasks,
    )

    return DeliveryCreateResponse(delivery_id=job.id)


@router.get("/deliveries/{delivery_id}", response_model=DeliveryWrapper)
def get_delivery(
    delivery_id: str,
    services: ApplicationServices = Depends(get_application_services),
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
