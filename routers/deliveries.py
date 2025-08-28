"""HTTP routes for creating and querying delivery jobs."""

import json
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from db import get_session
from dependencies import get_delivery_service
from models import DeliveryJob
from schemas import DeliveryCreate, DeliveryCreateResponse, DeliveryWrapper
from services import DeliveryService, deliver_cli, deliver_http

router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", None)


@router.post("/deliveries", status_code=201, response_model=DeliveryCreateResponse)
def create_delivery(
    delivery: DeliveryCreate,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_delivery_service),  # noqa: B008
):
    """Create a delivery job and either enqueue it or schedule a background task."""
    dj = service.create_job(delivery.prompt, delivery.mode, delivery.params or {})
    if REDIS_URL:
        try:
            from tasks import process_delivery, q  # noqa: F401

            # enqueue with delivery id
            q.enqueue("tasks.process_delivery", dj.id)
        except Exception:
            # fallback to BackgroundTasks
            if delivery.mode == "http" and delivery.params:
                try:
                    from schemas import ComposeDeliveryHTTP

                    params = ComposeDeliveryHTTP(**delivery.params)
                    background_tasks.add_task(deliver_http, delivery.prompt, params)
                except Exception:
                    pass
            elif delivery.mode == "cli":
                background_tasks.add_task(
                    deliver_cli,
                    delivery.prompt,
                    delivery.params or {},
                )
    else:
        # no redis configured, run via BackgroundTasks as before
        if delivery.mode == "http" and delivery.params:
            try:
                from schemas import ComposeDeliveryHTTP

                params = ComposeDeliveryHTTP(**delivery.params)
                background_tasks.add_task(
                    deliver_http,
                    delivery.prompt,
                    params,
                )
            except Exception:
                pass
        elif delivery.mode == "cli":
            background_tasks.add_task(
                deliver_cli,
                delivery.prompt,
                delivery.params or {},
            )

    return {"delivery_id": dj.id}


@router.get("/deliveries/{delivery_id}", response_model=DeliveryWrapper)
def get_delivery(delivery_id: str):
    """Return the delivery job state for `delivery_id`."""
    with get_session() as sess:
        dj = sess.get(DeliveryJob, delivery_id)
        if not dj:
            raise HTTPException(status_code=404, detail="delivery not found")
        rd = dj.model_dump()
        try:
            rd["params"] = json.loads(dj.params) if dj.params else {}
        except Exception:
            rd["params"] = {}
    return {"delivery": rd}
