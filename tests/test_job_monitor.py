"""The lifespan-owned job progress monitor, driven one tick at a time.

Jobs live in the test database and change status through the production
transitions (``claim_job``, ``finish_job``, ``cancel_job``); the monitor
reads them through :class:`DeliveryJobStateRepository` and broadcasts through
a real :class:`ConnectionManager` to a subscribed fake WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pytest

from backend.schemas import SDNextGenerationResult, WebSocketSubscription
from backend.services.deliveries import DeliveryService
from backend.services.websocket import (
    ConnectionManager,
    DeliveryJobStateRepository,
    JobObservation,
    JobProgressMonitor,
)
from backend.utils.images import make_output_reference
from tests.util.delivery_jobs import set_job_status

Message = Tuple[str, Dict[str, Any]]


class _ClientSocket:
    def __init__(self) -> None:
        self.sent: List[Dict[str, Any]] = []

    async def accept(self) -> None:
        return None

    async def send_text(self, message: str) -> None:
        self.sent.append(json.loads(message))


class _SDNext:
    """Fake generation service: SD.Next's progress is global."""

    def __init__(self, progress: float = 0.6) -> None:
        self.progress = progress
        self.calls: List[Tuple[str, str]] = []

    async def check_generation_progress(
        self, job_id: str, backend_name: str = "sdnext"
    ) -> SDNextGenerationResult:
        self.calls.append((job_id, backend_name))
        return SDNextGenerationResult(
            job_id=job_id, status="running", progress=self.progress
        )


class _Harness:
    def __init__(self, deliveries: DeliveryService, sdnext: _SDNext) -> None:
        self.deliveries = deliveries
        self.sdnext = sdnext
        self.manager = ConnectionManager()
        self.socket = _ClientSocket()
        self.load_threads: List[int] = []

        @contextmanager
        def session_factory():
            self.load_threads.append(threading.get_ident())
            yield deliveries.repository.session

        self.repository = DeliveryJobStateRepository(session_factory=session_factory)
        self.monitor = self.new_monitor()

    def new_monitor(self) -> JobProgressMonitor:
        return JobProgressMonitor(
            broadcaster=self.manager,
            repository=self.repository,
            generation=self.sdnext,
            interval_seconds=0.01,
        )

    async def subscribe(self) -> None:
        connection_id = await self.manager.connect(self.socket)
        await self.manager.handle_subscription(
            connection_id, WebSocketSubscription(job_ids=None)
        )
        self.socket.sent.clear()

    async def tick(self) -> List[Message]:
        """Run one tick and return the job messages it sent."""
        self.socket.sent.clear()
        await self.monitor.tick()
        return [(message["type"], message["data"]) for message in self.socket.sent]

    def create_job(self, prompt: str = "a lighthouse", **params: Any) -> str:
        payload = {
            "generation_params": {"prompt": prompt, "steps": 12},
            "backend": "sdnext",
            **params,
        }
        return self.deliveries.create_job(prompt, "sdnext", payload).id


@pytest.fixture
async def harness(delivery_service: DeliveryService) -> _Harness:
    harness = _Harness(delivery_service, _SDNext())
    await harness.subscribe()
    return harness


def _types(messages: Sequence[Message], job_id: str) -> List[str]:
    return [kind for kind, data in messages if data["job_id"] == job_id]


def _data(messages: Sequence[Message], kind: str, job_id: str) -> Dict[str, Any]:
    matches = [d for k, d in messages if k == kind and d["job_id"] == job_id]
    assert len(matches) == 1, (kind, job_id, messages)
    return matches[0]


@pytest.mark.anyio
async def test_generation_started_is_sent_when_a_runner_claims_the_job(
    harness: _Harness,
) -> None:
    job_id = harness.create_job()

    queued = await harness.tick()
    assert _types(queued, job_id) == ["progress_update"]
    assert _data(queued, "progress_update", job_id)["status"] == "queued"

    harness.deliveries.claim_job(job_id)
    claimed = await harness.tick()
    assert _types(claimed, job_id) == ["generation_started", "progress_update"]
    started = _data(claimed, "generation_started", job_id)
    assert started["params"]["prompt"] == "a lighthouse"
    assert started["params"]["steps"] == 12

    still_running = await harness.tick()
    assert _types(still_running, job_id) == ["progress_update"]


@pytest.mark.anyio
async def test_sdnext_progress_is_read_only_for_the_running_job(
    harness: _Harness,
) -> None:
    running = harness.create_job("running")
    queued = harness.create_job("queued")
    stored = harness.create_job("stored progress")
    harness.deliveries.claim_job(running)
    set_job_status(harness.deliveries, stored, "pending", {"progress": 0.2})

    messages = await harness.tick()

    assert harness.sdnext.calls == [(running, "sdnext")]
    running_update = _data(messages, "progress_update", running)
    assert running_update["status"] == "processing"
    assert running_update["progress"] == pytest.approx(0.6)
    queued_update = _data(messages, "progress_update", queued)
    assert queued_update["status"] == "queued"
    assert queued_update["progress"] == 0.0
    assert _data(messages, "progress_update", stored)["progress"] == pytest.approx(0.2)


@pytest.mark.anyio
async def test_no_sdnext_call_while_nothing_is_running(harness: _Harness) -> None:
    harness.create_job()

    await harness.tick()

    assert harness.sdnext.calls == []


@pytest.mark.anyio
async def test_succeeded_job_gets_final_progress_and_completion(
    harness: _Harness,
) -> None:
    job_id = harness.create_job()
    harness.deliveries.claim_job(job_id)
    await harness.tick()

    harness.deliveries.finish_job(
        job_id,
        "succeeded",
        {
            "status": "completed",
            "images": [make_output_reference("job_0.png")],
            "generation_info": {"seed": 7},
        },
    )
    messages = await harness.tick()

    assert _types(messages, job_id) == ["progress_update", "generation_complete"]
    final = _data(messages, "progress_update", job_id)
    assert final["status"] == "completed"
    assert final["progress"] == 1.0
    complete = _data(messages, "generation_complete", job_id)
    assert complete["status"] == "completed"
    assert complete["images"] == [f"/api/v1/generation/results/{job_id}/images/0"]
    assert complete["generation_info"] == {"seed": 7}
    assert complete["error_message"] is None
    assert complete["total_duration"] is not None

    assert _types(await harness.tick(), job_id) == []


@pytest.mark.anyio
async def test_failed_job_gets_completion_with_its_error(harness: _Harness) -> None:
    job_id = harness.create_job()
    harness.deliveries.claim_job(job_id)
    await harness.tick()

    harness.deliveries.finish_job(
        job_id, "failed", {"status": "failed", "error_message": "out of memory"}
    )
    messages = await harness.tick()

    assert _types(messages, job_id) == ["progress_update", "generation_complete"]
    assert _data(messages, "progress_update", job_id)["status"] == "failed"
    complete = _data(messages, "generation_complete", job_id)
    assert complete["status"] == "failed"
    assert complete["error_message"] == "out of memory"
    assert complete["images"] is None


@pytest.mark.anyio
@pytest.mark.parametrize("claimed", [True, False])
async def test_cancelled_job_is_dropped_without_a_completion(
    harness: _Harness, claimed: bool
) -> None:
    job_id = harness.create_job()
    if claimed:
        harness.deliveries.claim_job(job_id)
    await harness.tick()

    harness.deliveries.cancel_job(job_id)

    assert _types(await harness.tick(), job_id) == []
    assert _types(await harness.tick(), job_id) == []


@pytest.mark.anyio
async def test_job_that_runs_between_two_ticks_is_still_reported(
    harness: _Harness,
) -> None:
    await harness.tick()  # seeds an empty queue
    job_id = harness.create_job()
    harness.deliveries.claim_job(job_id)
    harness.deliveries.finish_job(job_id, "failed", {"error_message": "no images"})

    messages = await harness.tick()

    assert _types(messages, job_id) == [
        "generation_started",
        "progress_update",
        "generation_complete",
    ]
    assert _data(messages, "generation_complete", job_id)["error_message"] == (
        "no images"
    )
    assert _types(await harness.tick(), job_id) == []


@pytest.mark.anyio
async def test_unclaimed_job_that_failed_gets_no_started_message(
    harness: _Harness,
) -> None:
    await harness.tick()
    job_id = harness.create_job()
    set_job_status(harness.deliveries, job_id, "failed", {"error": "queue down"})

    messages = await harness.tick()

    assert _types(messages, job_id) == ["progress_update", "generation_complete"]


@pytest.mark.anyio
async def test_restart_seeds_tracking_from_jobs_already_running(
    harness: _Harness,
) -> None:
    finished_before = harness.create_job("finished before the restart")
    harness.deliveries.claim_job(finished_before)
    harness.deliveries.finish_job(finished_before, "succeeded", {"images": []})
    running = harness.create_job("running in the RQ worker")
    harness.deliveries.claim_job(running)

    # A fresh monitor, as after an API restart: no request ever named the job.
    harness.monitor = harness.new_monitor()
    seeded = await harness.tick()

    assert _types(seeded, running) == ["generation_started", "progress_update"]
    assert _data(seeded, "progress_update", running)["progress"] == pytest.approx(0.6)
    assert _types(seeded, finished_before) == []

    harness.deliveries.finish_job(running, "succeeded", {"images": []})
    finished = await harness.tick()

    assert _types(finished, running) == ["progress_update", "generation_complete"]
    assert _types(finished, finished_before) == []


@pytest.mark.anyio
async def test_nothing_is_loaded_or_polled_without_subscribers(
    delivery_service: DeliveryService,
) -> None:
    harness = _Harness(delivery_service, _SDNext())
    job_id = harness.create_job()
    harness.deliveries.claim_job(job_id)

    assert await harness.tick() == []
    assert harness.load_threads == []
    assert harness.sdnext.calls == []

    await harness.subscribe()
    messages = await harness.tick()

    assert _types(messages, job_id) == ["generation_started", "progress_update"]
    assert harness.sdnext.calls == [(job_id, "sdnext")]


@pytest.mark.anyio
async def test_tracking_is_forgotten_while_nobody_listens(
    delivery_service: DeliveryService,
) -> None:
    harness = _Harness(delivery_service, _SDNext())
    await harness.subscribe()
    job_id = harness.create_job()
    harness.deliveries.claim_job(job_id)
    await harness.tick()

    harness.manager.disconnect(next(iter(harness.manager.active_connections)))
    await harness.tick()
    harness.deliveries.finish_job(job_id, "succeeded", {"images": []})
    await harness.subscribe()

    # The job finished while nobody listened; the new subscriber is not sent
    # a stale completion, and the queue feed tells it the job is gone.
    assert _types(await harness.tick(), job_id) == []


@pytest.mark.anyio
async def test_jobs_are_loaded_off_the_event_loop(harness: _Harness) -> None:
    harness.create_job()

    await harness.tick()

    assert harness.load_threads
    assert threading.get_ident() not in harness.load_threads


@pytest.mark.anyio
async def test_other_deliveries_are_not_reported(harness: _Harness) -> None:
    job = harness.deliveries.create_job("hook", "http", {"url": "http://x"})
    harness.deliveries.claim_job(job.id)

    assert _types(await harness.tick(), job.id) == []
    assert harness.sdnext.calls == []


@pytest.mark.anyio
async def test_sdnext_error_still_reports_stored_state(harness: _Harness) -> None:
    class _Unreachable(_SDNext):
        async def check_generation_progress(self, job_id, backend_name="sdnext"):
            raise ConnectionError("SD.Next is down")

    harness.monitor._generation = _Unreachable()
    job_id = harness.create_job()
    harness.deliveries.claim_job(job_id)

    messages = await harness.tick()

    update = _data(messages, "progress_update", job_id)
    assert update["status"] == "processing"
    assert update["progress"] == 0.0


class _FailingOnceRepository:
    def __init__(self) -> None:
        self.calls = 0
        self.loaded = asyncio.Event()

    def load_jobs(
        self, *, finished_since: Optional[datetime], job_ids: Sequence[str]
    ) -> JobObservation:
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("database unavailable")
        self.loaded.set()
        return JobObservation(observed_at=datetime(2026, 1, 1), jobs=[])


@pytest.mark.anyio
async def test_loop_survives_a_failed_tick_and_stops(harness: _Harness) -> None:
    repository = _FailingOnceRepository()
    monitor = JobProgressMonitor(
        broadcaster=harness.manager,
        repository=repository,
        generation=harness.sdnext,
        interval_seconds=0.001,
    )
    # ``start`` is stubbed for the whole suite (tests/conftest.py).
    monitor._task = asyncio.create_task(monitor._run())

    await asyncio.wait_for(repository.loaded.wait(), timeout=2.0)
    await monitor.stop()

    assert repository.calls >= 2
    assert monitor._task is None
