"""Unit tests for WebSocket connection routing and job state loading."""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import timedelta
from typing import List

import pytest

from backend.schemas import ProgressUpdate, WebSocketSubscription
from backend.services.deliveries import DeliveryService
from backend.services.websocket import ConnectionManager, DeliveryJobStateRepository
from tests.util.delivery_jobs import set_job_status


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
        conn_specific,
        WebSocketSubscription(job_ids=["job-123"]),
    )
    await manager.handle_subscription(conn_global, WebSocketSubscription(job_ids=None))
    await manager.handle_subscription(
        conn_other,
        WebSocketSubscription(job_ids=["job-456"]),
    )

    update = ProgressUpdate(job_id="job-123", progress=0.25, status="running")
    await manager.broadcast_progress("job-123", update)

    specific_payloads = [
        msg for msg in ws_job_specific.sent if msg["type"] == "progress_update"
    ]
    global_payloads = [
        msg for msg in ws_global.sent if msg["type"] == "progress_update"
    ]
    other_payloads = [msg for msg in ws_other.sent if msg["type"] == "progress_update"]

    assert len(specific_payloads) == 1
    assert specific_payloads[0]["data"]["job_id"] == "job-123"

    assert len(global_payloads) == 1
    assert global_payloads[0]["data"]["job_id"] == "job-123"

    assert other_payloads == []


@pytest.mark.anyio
async def test_connection_manager_reports_subscribers() -> None:
    manager = ConnectionManager()
    assert manager.has_subscribers() is False

    connection_id = await manager.connect(_FakeWebSocket())
    # Connected but not subscribed: no job message would reach it.
    assert manager.has_subscribers() is False

    await manager.handle_subscription(
        connection_id, WebSocketSubscription(job_ids=["job-1"])
    )
    assert manager.has_subscribers() is True

    manager.disconnect(connection_id)
    assert manager.has_subscribers() is False


def test_delivery_job_state_repository_loads_monitored_jobs(
    delivery_service: DeliveryService,
) -> None:
    finished = delivery_service.create_job("Prompt", "sdnext", {"foo": "bar"})
    set_job_status(delivery_service, finished.id, "running")
    set_job_status(
        delivery_service,
        finished.id,
        "succeeded",
        {"status": "completed", "progress": 0.8},
    )
    pending = delivery_service.create_job("Queued", "sdnext", {})

    @contextmanager
    def session_factory():
        yield delivery_service.repository.session

    repository = DeliveryJobStateRepository(session_factory=session_factory)

    active_only = repository.load_jobs(finished_since=None, job_ids=())
    assert [job.job_id for job in active_only.jobs] == [pending.id]

    named = repository.load_jobs(finished_since=None, job_ids=[finished.id])
    state = next(job for job in named.jobs if job.job_id == finished.id)
    assert state.status == "succeeded"
    assert state.mode == "sdnext"
    assert state.params == {"foo": "bar"}
    assert state.result == {"status": "completed", "progress": 0.8}
    assert state.started_at is not None
    assert state.finished_at is not None

    recent = repository.load_jobs(
        finished_since=active_only.observed_at - timedelta(minutes=1), job_ids=()
    )
    assert {job.job_id for job in recent.jobs} == {pending.id, finished.id}

    later = repository.load_jobs(
        finished_since=recent.observed_at + timedelta(minutes=1), job_ids=()
    )
    assert [job.job_id for job in later.jobs] == [pending.id]
