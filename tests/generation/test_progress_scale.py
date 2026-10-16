"""The API reports progress on one scale: a fraction in [0, 1].

REST queue responses and the progress WebSocket read the same stored job
state, so they must report the same fraction for it. A stored ``1`` is the
fraction 1.0 (complete), never 1 %; values above 1 are legacy percentages.
"""

from __future__ import annotations

import asyncio
import math
from contextlib import contextmanager
from typing import Any, List, Optional

import pytest
from fastapi.testclient import TestClient

from backend.api.v1.generation.presenters.jobs import build_active_job
from backend.schemas import ProgressUpdate, SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.websocket import WebSocketService
from backend.services.websocket.job_monitor import JobProgressMonitor
from backend.services.websocket.persistence import DeliveryJobStateRepository
from backend.utils.progress import to_progress_fraction
from tests.util.delivery_jobs import set_job_status


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, 0.0),
        (0.0, 0.0),
        (0.01, 0.01),
        (0.5, 0.5),
        (1, 1.0),
        (1.0, 1.0),
        (50, 0.5),
        (100, 1.0),
        (150, 1.0),
        (-0.2, 0.0),
        ("0.25", 0.25),
    ],
)
def test_to_progress_fraction(value: Any, expected: float) -> None:
    assert to_progress_fraction(value) == pytest.approx(expected)


@pytest.mark.parametrize("value", [None, True, False, "abc", math.nan, math.inf, []])
def test_to_progress_fraction_rejects_non_numbers(value: Any) -> None:
    assert to_progress_fraction(value) is None


class _LiveProgressClient:
    """Fake SD.Next whose global progress belongs to some other job."""

    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        return SDNextGenerationResult(job_id=job_id, status="running", progress=0.3)


async def _first_websocket_progress(
    delivery_service: DeliveryService, job_id: str
) -> float:
    @contextmanager
    def session_factory():
        yield delivery_service.repository.session

    monitor = JobProgressMonitor(
        repository=DeliveryJobStateRepository(session_factory=session_factory),
        poll_interval=0.0,
    )
    updates: List[ProgressUpdate] = []
    first_update = asyncio.Event()

    async def on_progress(update: ProgressUpdate) -> None:
        updates.append(update)
        first_update.set()

    async def on_complete(message) -> None:
        return None

    task = await monitor.start(job_id, _LiveProgressClient(), on_progress, on_complete)
    try:
        await asyncio.wait_for(first_update.wait(), timeout=1.0)
    finally:
        monitor.stop(job_id)
        await asyncio.gather(task, return_exceptions=True)
    return updates[0].progress


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status", "stored_progress", "expected"),
    [
        ("pending", None, 0.0),
        ("running", 0, 0.0),
        ("running", 0.01, 0.01),
        ("running", 0.5, 0.5),
        ("running", 1, 1.0),  # the fraction 1.0, not 1 %
        ("running", 1.0, 1.0),
        ("running", 50, 0.5),  # legacy stored percentage
        ("succeeded", None, 1.0),
        ("succeeded", 50, 1.0),
        ("failed", 0.4, 0.4),
    ],
)
async def test_rest_and_websocket_report_the_same_fraction(
    delivery_service: DeliveryService,
    status: str,
    stored_progress: Optional[float],
    expected: float,
) -> None:
    job = delivery_service.create_job("Prompt", "sdnext", {})
    result = {} if stored_progress is None else {"progress": stored_progress}
    if status != "pending":
        set_job_status(delivery_service, job.id, "running")
        if status != "running" or result:
            set_job_status(delivery_service, job.id, status, result or None)

    coordinator = GenerationCoordinator(
        delivery_service, WebSocketService(), GenerationService()
    )
    rest_progress = build_active_job(job, coordinator).progress
    websocket_progress = await _first_websocket_progress(delivery_service, job.id)

    assert rest_progress == pytest.approx(expected)
    assert websocket_progress == pytest.approx(expected)


def test_active_jobs_endpoint_reports_fractions(
    client: TestClient, delivery_service: DeliveryService
) -> None:
    complete = delivery_service.create_job("complete", "sdnext", {})
    set_job_status(delivery_service, complete.id, "running", {"progress": 1})
    legacy = delivery_service.create_job("legacy", "sdnext", {})
    set_job_status(delivery_service, legacy.id, "running", {"progress": 50})
    early = delivery_service.create_job("early", "sdnext", {})
    set_job_status(delivery_service, early.id, "running", {"progress": 0.01})

    response = client.get("/api/v1/generation/jobs/active")
    assert response.status_code == 200

    progress = {item["id"]: item["progress"] for item in response.json()}
    assert progress == {
        complete.id: pytest.approx(1.0),
        legacy.id: pytest.approx(0.5),
        early.id: pytest.approx(0.01),
    }


def _assert_fraction_bounds(field: dict, name: str) -> None:
    bounds = field.get("anyOf", [field])[0]
    assert bounds.get("minimum") == 0.0, name
    assert bounds.get("maximum") == 1.0, name


def test_openapi_declares_progress_as_a_fraction(client: TestClient) -> None:
    schemas = client.get("/api/openapi.json").json()["components"]["schemas"]

    for name in ("GenerationJobStatus", "SDNextGenerationResult"):
        _assert_fraction_bounds(schemas[name]["properties"]["progress"], name)
    # The WebSocket message is not an HTTP response model.
    _assert_fraction_bounds(
        ProgressUpdate.model_json_schema()["properties"]["progress"], "ProgressUpdate"
    )
