"""Unit tests for generation presenter helpers."""

from __future__ import annotations

import pytest

from backend.services.deliveries import DeliveryService
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.generation.presenter import build_active_job, build_result
from backend.services.websocket import WebSocketService


@pytest.fixture
def coordinator(delivery_service: DeliveryService) -> GenerationCoordinator:
    """Coordinator fixture bound to the delivery service."""

    return GenerationCoordinator(
        delivery_service,
        WebSocketService(),
        GenerationService(),
    )


def _params(prompt: str = "Prompt") -> dict:
    return {
        "generation_params": {
            "prompt": prompt,
            "negative_prompt": "nope",
            "width": 512,
            "height": 512,
            "steps": 20,
            "cfg_scale": 7.0,
            "seed": 123,
        },
    }


def test_build_active_job_normalizes_cancelled_status(
    delivery_service: DeliveryService, coordinator: GenerationCoordinator,
):
    """Cancelled jobs are exposed as failed with retained result payload."""

    job = delivery_service.create_job("Prompt", "sdnext", _params())
    delivery_service.update_job_status(job.id, "cancelled", {"status": "cancelled"})

    presenter = build_active_job(job, coordinator)

    assert presenter.status == "failed"
    assert presenter.result == {"status": "cancelled"}
    assert presenter.startTime is not None


def test_build_result_handles_missing_images(
    delivery_service: DeliveryService, coordinator: GenerationCoordinator,
):
    """Missing images or invalid thumbnail URLs result in empty links."""

    job = delivery_service.create_job("Prompt", "sdnext", _params())
    delivery_service.update_job_status(
        job.id,
        "succeeded",
        {
            "status": "completed",
            "thumbnail_url": 42,
        },
    )

    summary = build_result(job, coordinator)

    assert summary.image_url is None
    assert summary.thumbnail_url is None
    assert summary.status == "completed"


def test_build_result_parses_generation_info_string(
    delivery_service: DeliveryService, coordinator: GenerationCoordinator,
):
    """Stringified generation info payloads are parsed into dictionaries."""

    job = delivery_service.create_job("Prompt", "sdnext", _params())
    delivery_service.update_job_status(
        job.id,
        "succeeded",
        {
            "status": "completed",
            "generation_info": "{\"duration\": 1.23}",
        },
    )

    summary = build_result(job, coordinator)
    assert summary.generation_info == {"duration": 1.23}


def test_build_result_handles_malformed_generation_info(
    delivery_service: DeliveryService, coordinator: GenerationCoordinator,
):
    """Malformed generation info strings are coerced to None."""

    job = delivery_service.create_job("Prompt", "sdnext", _params())
    delivery_service.update_job_status(
        job.id,
        "succeeded",
        {
            "status": "completed",
            "generation_info": "not-json",
        },
    )

    summary = build_result(job, coordinator)
    assert summary.generation_info is None
