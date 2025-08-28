"""Compose endpoint: build prompts from adapters and optionally create a delivery job.

This module exposes a single POST /compose endpoint that builds a prompt
from active adapters and optionally schedules a delivery.
"""

from fastapi import APIRouter, BackgroundTasks

from schemas import ComposeRequest, ComposeResponse
from services import (
    create_delivery_job,
    deliver_cli,
    deliver_http,
    format_token,
    list_active_adapters_ordered,
)

router = APIRouter()


@router.post("/compose", response_model=ComposeResponse)
def compose(req: ComposeRequest, background_tasks: BackgroundTasks):
    """Compose a prompt from active adapters and optionally schedule delivery."""
    adapters = list_active_adapters_ordered()
    tokens = [format_token(a.name, a.weight) for a in adapters]
    prompt_parts = []
    if req.prefix:
        prompt_parts.append(req.prefix)
    prompt_parts.extend(tokens)
    if req.suffix:
        prompt_parts.append(req.suffix)
    prompt = " ".join(prompt_parts)

    delivery_info = None
    if req.delivery:
        dj = create_delivery_job(prompt, req.delivery.mode, req.delivery.model_dump())
        delivery_info = {"id": dj.id, "status": dj.status}
        if req.delivery.mode == "http" and req.delivery.http:
            background_tasks.add_task(deliver_http, prompt, req.delivery.http)
        elif req.delivery.mode == "cli" and req.delivery.cli:
            background_tasks.add_task(deliver_cli, prompt, req.delivery.cli)

    return {"prompt": prompt, "tokens": tokens, "delivery": delivery_info}
