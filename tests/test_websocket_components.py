"""Unit tests for WebSocket connection routing and job monitoring."""

from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import List

import pytest

from backend.schemas import ProgressUpdate, SDNextGenerationResult, WebSocketSubscription
from backend.services.deliveries import DeliveryService
from backend.services.websocket import (
    ConnectionManager,
    JobProgressMonitor,
    PersistedJobState,
)
from backend.services.websocket.persistence import DeliveryJobStateRepository


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: List[dict] = []

    async def accept(self) -> None:  # pragma: no cover - simple stub
        return None

    async def send_text(self, message: str) -> None:
        self.sent.append(json.loads(message))


@pytest.mark.anyio
async def test_connection_manager_routes_subscriptions() -> None:
    manager = ConnectionManager()
    ws_job_specific = _FakeWebSocket()
    ws_global = _FakeWebSocket()
    ws_other = _FakeWebSocket()

    conn_specific = await manager.connect(ws_job_specific)
    conn_global = await manager.connect(ws_global)
    conn_other = await manager.connect(ws_other)

    await manager.handle_subscription(
        conn_specific, WebSocketSubscription(job_ids=["job-123"])
    )
    await manager.handle_subscription(conn_global, WebSocketSubscription(job_ids=None))
    await manager.handle_subscription(
        conn_other, WebSocketSubscription(job_ids=["job-456"])
    )

    update = ProgressUpdate(job_id="job-123", progress=0.25, status="running")
    await manager.broadcast_progress("job-123", update)

    specific_payloads = [msg for msg in ws_job_specific.sent if msg["type"] == "progress_update"]
    global_payloads = [msg for msg in ws_global.sent if msg["type"] == "progress_update"]
    other_payloads = [msg for msg in ws_other.sent if msg["type"] == "progress_update"]

    assert len(specific_payloads) == 1
    assert specific_payloads[0]["data"]["job_id"] == "job-123"

    assert len(global_payloads) == 1
    assert global_payloads[0]["data"]["job_id"] == "job-123"

    assert other_payloads == []


@pytest.mark.anyio
async def test_job_progress_monitor_merges_persisted_state() -> None:
    persisted = PersistedJobState(
        status="succeeded",
        result={
            "status": "completed",
            "progress": 1.0,
            "images": ["stored-image"],
            "generation_info": {"duration": 1.2},
        },
        started_at=datetime.now(timezone.utc) - timedelta(seconds=5),
        finished_at=datetime.now(timezone.utc),
    )

    class StubRepository:
        def get_job_state(self, job_id: str) -> PersistedJobState:
            assert job_id == "job-123"
            return persisted

    class DummyGenerationService:
        async def check_progress(self, job_id: str) -> SDNextGenerationResult:
            return SDNextGenerationResult(job_id=job_id, status="running", progress=0.0)

    monitor = JobProgressMonitor(repository=StubRepository(), poll_interval=0.0)

    progress_updates: List[ProgressUpdate] = []
    completions = []

    async def on_progress(update: ProgressUpdate) -> None:
        progress_updates.append(update)

    async def on_complete(message):
        completions.append(message)

    task = await monitor.start(
        "job-123",
        DummyGenerationService(),
        on_progress=on_progress,
        on_complete=on_complete,
    )
    await asyncio.wait_for(task, timeout=0.1)

    assert progress_updates
    assert progress_updates[0].status == "completed"
    assert progress_updates[0].progress == pytest.approx(1.0)

    assert completions
    assert completions[0].status == "completed"
    assert completions[0].images == ["stored-image"]
    assert completions[0].generation_info == {"duration": 1.2}
    assert completions[0].total_duration is not None


def test_delivery_job_state_repository_returns_persisted_state(
    delivery_service: DeliveryService,
) -> None:
    job = delivery_service.create_job("Prompt", "sdnext", {"foo": "bar"})
    delivery_service.update_job_status(job.id, "running")
    delivery_service.update_job_status(
        job.id,
        "succeeded",
        {"status": "completed", "progress": 0.8},
    )

    @contextmanager
    def session_factory():
        yield delivery_service.repository._session

    repository = DeliveryJobStateRepository(session_factory=session_factory)
    state = repository.get_job_state(job.id)

    assert state is not None
    assert state.status == "succeeded"
    assert state.result == {"status": "completed", "progress": 0.8}
    assert state.started_at is not None
    assert state.finished_at is not None

    assert repository.get_job_state("missing") is None
