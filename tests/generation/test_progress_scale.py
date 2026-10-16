"""The API reports progress on one scale: a fraction in [0, 1].

REST queue responses and the progress WebSocket read the same stored job
state, so they must report the same fraction for it. A stored ``1`` is the
fraction 1.0 (complete), never 1 %; values above 1 are legacy percentages.
"""

from __future__ import annotations

import math
from contextlib import contextmanager
from typing import Any, Callable, List, Optional

import pytest
from fastapi.testclient import TestClient

from backend.api.v1.generation.presenters.jobs import build_active_job
from backend.schemas import ProgressUpdate, SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.websocket import (
    DeliveryJobStateRepository,
    JobProgressMonitor,
)
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

    async def check_generation_progress(
        self, job_id: str, backend_name: str = "sdnext"
    ) -> SDNextGenerationResult:
        return SDNextGenerationResult(job_id=job_id, status="running", progress=0.3)


class _RecordingBroadcaster:
    def __init__(self) -> None:
        self.updates: List[ProgressUpdate] = []

    def has_subscribers(self) -> bool:
        return True

    async def broadcast_generation_started(self, job_id, started_data) -> None:
        return None

    async def broadcast_progress(self, job_id, progress_data) -> None:
        self.updates.append(progress_data)

    async def broadcast_generation_complete(self, job_id, complete_data) -> None:
        return None


async def _websocket_progress(
    delivery_service: DeliveryService,
    job_id: str,
    move_to_final_state: Callable[[], None],
) -> float:
    """Return the last progress the WebSocket reports for ``job_id``.

    The monitor first sees the job active, then once more after
    ``move_to_final_state``, which finishes it (the final progress update)
    or leaves it active.
    """

    @contextmanager
    def session_factory():
        yield delivery_service.repository.session

    broadcaster = _RecordingBroadcaster()
    monitor = JobProgressMonitor(
        broadcaster=broadcaster,
        repository=DeliveryJobStateRepository(session_factory=session_factory),
        generation=_LiveProgressClient(),
        interval_seconds=0.0,
    )
    await monitor.tick()
    move_to_final_state()
    await monitor.tick()
    updates = [update for update in broadcaster.updates if update.job_id == job_id]
    return updates[-1].progress


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
    job = delivery_service.create_job(
        "Prompt", "sdnext", {"generation_params": {"prompt": "Prompt"}}
    )
    result = {} if stored_progress is None else {"progress": stored_progress}
    if status != "pending":
        set_job_status(delivery_service, job.id, "running")

    def move_to_final_state() -> None:
        if status not in {"pending", "running"} or result:
            set_job_status(delivery_service, job.id, status, result or None)

    websocket_progress = await _websocket_progress(
        delivery_service, job.id, move_to_final_state
    )
    coordinator = GenerationCoordinator(delivery_service, GenerationService())
    rest_progress = build_active_job(job, coordinator).progress

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
