"""Contract between the progress WebSocket and the SPA's message parser.

The messages captured here come from the real WebSocket service, connection
manager and job progress monitor, and must equal
``tests/fixtures/generation_websocket_contract.json``. The frontend spec
``tests/vue/services/generation/websocketContract.spec.ts`` replays that file
through the browser's WebSocket manager, so a change on either side fails one
of the two suites instead of silently breaking live progress.

After a deliberate backend change, regenerate the fixture and make the
frontend spec pass again::

    UPDATE_WS_CONTRACT=1 pytest tests/test_websocket_contract.py
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

import pytest
from fastapi import WebSocketDisconnect

from backend.schemas import (
    SDNextGenerationParams,
    SDNextGenerationResult,
    WebSocketSubscription,
)
from backend.services.websocket import (
    ConnectionManager,
    JobObservation,
    JobProgressMonitor,
    PersistedJob,
    WebSocketService,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "generation_websocket_contract.json"
)
FIXED_TIMESTAMP = "2026-01-01T00:00:00+00:00"
PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQAB"
    "DQottAAAAABJRU5ErkJggg=="
)


class _ClientWebSocket:
    """Stand-in for a browser connection driven through ``handle_connection``."""

    def __init__(self) -> None:
        self.sent: List[Dict[str, Any]] = []
        self._inbox: asyncio.Queue[str | None] = asyncio.Queue()

    async def accept(self) -> None:
        return None

    async def send_text(self, message: str) -> None:
        self.sent.append(json.loads(message))

    async def receive_text(self) -> str:
        message = await self._inbox.get()
        if message is None:
            raise WebSocketDisconnect()
        return message

    def client_send(self, payload: Dict[str, Any]) -> None:
        self._inbox.put_nowait(json.dumps(payload))

    def client_close(self) -> None:
        self._inbox.put_nowait(None)


GENERATION_PARAMS = {
    "generation_params": SDNextGenerationParams(
        prompt="a lighthouse at dusk"
    ).model_dump(),
    "backend": "sdnext",
}
CLAIMED_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)


class _ScriptedRepository:
    """Return one scripted set of stored jobs per monitor tick."""

    def __init__(self, ticks: List[List[PersistedJob]]) -> None:
        self._ticks = ticks

    def load_jobs(
        self, *, finished_since: Optional[datetime], job_ids: Sequence[str]
    ) -> JobObservation:
        return JobObservation(observed_at=CLAIMED_AT, jobs=self._ticks.pop(0))


class _SDNext:
    """SD.Next halfway through the running job."""

    async def check_generation_progress(
        self, job_id: str, backend_name: str = "sdnext"
    ) -> SDNextGenerationResult:
        return SDNextGenerationResult(job_id=job_id, status="running", progress=0.5)


async def _wait_until(predicate: Callable[[], bool], timeout: float = 2.0) -> None:
    async def _poll() -> None:
        while not predicate():
            await asyncio.sleep(0)

    await asyncio.wait_for(_poll(), timeout=timeout)


def _normalize(message: Dict[str, Any]) -> Dict[str, Any]:
    """Pin the values that differ per run: timestamps and connection ids."""
    datetime.fromisoformat(message["timestamp"])
    normalized = {**message, "timestamp": FIXED_TIMESTAMP}
    if message["type"] == "connected":
        normalized["data"] = {**message["data"], "connection_id": "conn_1"}
    return normalized


async def _capture_contract() -> Dict[str, Any]:
    service = WebSocketService(connection_manager=ConnectionManager())
    # The rows the monitor reads on three ticks: "job-completed" is claimed,
    # then succeeds; "job-failed" is claimed and fails between two ticks.
    repository = _ScriptedRepository([
        [PersistedJob("job-completed", "running", "sdnext", GENERATION_PARAMS)],
        [
            PersistedJob(
                "job-completed",
                "succeeded",
                "sdnext",
                GENERATION_PARAMS,
                result={
                    "status": "completed",
                    "images": [PNG_BASE64],
                    "generation_info": {"seed": 1234},
                },
            )
        ],
        [
            PersistedJob(
                "job-failed",
                "failed",
                "sdnext",
                GENERATION_PARAMS,
                result={
                    "status": "failed",
                    "error_message": "SD.Next returned no images",
                },
                started_at=CLAIMED_AT,
            )
        ],
    ])
    monitor = JobProgressMonitor(
        broadcaster=service.manager,
        repository=repository,
        generation=_SDNext(),
        interval_seconds=0.0,
    )

    subscription = WebSocketSubscription(job_ids=None).model_dump()
    client = _ClientWebSocket()
    connection = asyncio.create_task(service.handle_connection(client))
    client.client_send(subscription)
    await _wait_until(lambda: bool(service.manager.global_subscribers))
    await _wait_until(lambda: len(client.sent) == 2)

    for _ in range(3):
        await monitor.tick()

    client.client_close()
    await asyncio.wait_for(connection, timeout=2.0)

    return {
        "client": {"subscribe": subscription},
        "server": [_normalize(message) for message in client.sent],
    }


@pytest.mark.anyio
async def test_progress_websocket_messages_match_frontend_contract() -> None:
    contract = await _capture_contract()

    server_types = [message["type"] for message in contract["server"]]
    assert server_types == [
        "connected",
        "subscription_confirmed",
        "generation_started",
        "progress_update",
        "progress_update",
        "generation_complete",
        "generation_started",
        "progress_update",
        "generation_complete",
    ]

    rendered = json.dumps(contract, indent=2, sort_keys=True) + "\n"
    if os.environ.get("UPDATE_WS_CONTRACT"):
        FIXTURE_PATH.write_text(rendered, encoding="utf-8")

    assert FIXTURE_PATH.read_text(encoding="utf-8") == rendered, (
        "Progress WebSocket messages changed. If intended, run "
        "`UPDATE_WS_CONTRACT=1 pytest tests/test_websocket_contract.py` and "
        "update the frontend parser until "
        "tests/vue/services/generation/websocketContract.spec.ts passes."
    )
