"""Tests for generation job management endpoints."""

from __future__ import annotations

from typing import Dict

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.services import ServiceContainer
from backend.services.deliveries import DeliveryService


def _create_generation_params(prompt: str) -> Dict[str, Dict[str, object]]:
    return {
        "generation_params": {
            "prompt": prompt,
            "negative_prompt": "nope",
            "width": 640,
            "height": 480,
            "steps": 25,
            "cfg_scale": 7.5,
            "seed": 1234,
        }
    }


def test_list_active_generation_jobs_returns_running_and_pending(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Active jobs endpoint returns pending and running jobs only."""

    pending = delivery_service.create_job("Prompt A", "sdnext", _create_generation_params("Prompt A"))
    running = delivery_service.create_job("Prompt B", "sdnext", _create_generation_params("Prompt B"))
    delivery_service.update_job_status(running.id, "running")

    completed = delivery_service.create_job("Prompt C", "sdnext", _create_generation_params("Prompt C"))
    delivery_service.update_job_status(completed.id, "succeeded", {"status": "completed"})

    response = client.get("/api/v1/generation/jobs/active")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload, list)
    identifiers = {item["id"] for item in payload}
    assert identifiers == {pending.id, running.id}

    for job in payload:
        assert job["status"] in {"pending", "running"}
        assert job["jobId"] == job["id"]
        assert job["params"]["prompt"] in {"Prompt A", "Prompt B"}
        assert "startTime" in job and job["startTime"] is not None


def test_list_active_generation_jobs_empty_when_none(client: TestClient):
    """Endpoint returns an empty list when no jobs exist."""

    response = client.get("/api/v1/generation/jobs/active")
    assert response.status_code == 200
    assert response.json() == []


def test_cancel_generation_job_succeeds(
    client: TestClient,
    delivery_service: DeliveryService,
    monkeypatch: pytest.MonkeyPatch,
):
    """Cancelling an active job updates status and stops monitoring."""

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    delivery_service.update_job_status(job.id, "running")

    stop_mock = MagicMock()
    monkeypatch.setattr(
        "backend.services.websocket.websocket_service.stop_job_monitoring",
        stop_mock,
    )

    response = client.post(f"/api/v1/generation/jobs/{job.id}/cancel")
    assert response.status_code == 200

    payload = response.json()
    assert payload["success"] is True
    assert payload["status"] == "cancelled"

    updated = delivery_service.get_job(job.id)
    assert updated is not None and updated.status == "cancelled"
    stop_mock.assert_called_once_with(job.id)


def test_cancel_generation_job_not_found(client: TestClient):
    """Cancelling a nonexistent job returns 404."""

    response = client.post("/api/v1/generation/jobs/unknown/cancel")
    assert response.status_code == 404


def test_cancel_generation_job_invalid_state(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Cancelling a completed job returns an error."""

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    delivery_service.update_job_status(job.id, "succeeded", {"status": "completed"})

    response = client.post(f"/api/v1/generation/jobs/{job.id}/cancel")
    assert response.status_code == 400


def test_list_generation_results_returns_recent_jobs(
    client: TestClient,
    db_session,
):
    """Completed jobs are returned from the results endpoint respecting limit."""

    services = ServiceContainer(db_session)
    delivery_service = services.deliveries

    job = delivery_service.create_job("Prompt", "sdnext", _create_generation_params("Prompt"))
    result_payload = {
        "status": "completed",
        "images": ["data:image/png;base64,abc123"],
        "generation_info": {"duration": 1.23},
    }
    delivery_service.update_job_status(job.id, "succeeded", result_payload)

    response = client.get("/api/v1/generation/results", params={"limit": 5})
    assert response.status_code == 200

    results = response.json()
    assert len(results) == 1
    entry = results[0]
    assert entry["id"] == job.id
    assert entry["job_id"] == job.id
    assert entry["prompt"] == "Prompt"
    assert entry["image_url"] == "data:image/png;base64,abc123"
    assert entry["status"] == "succeeded"
    assert entry["width"] == 640
    assert entry["height"] == 480
    assert entry["steps"] == 25
    assert entry["cfg_scale"] == 7.5
    assert entry["seed"] == 1234

