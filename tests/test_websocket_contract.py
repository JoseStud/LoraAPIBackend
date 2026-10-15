"""Contract between the progress WebSocket and the SPA's message parser.

The messages captured here come from the real WebSocket service, connection
manager, job monitor and generation coordinator, and must equal
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
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List

import pytest
from fastapi import WebSocketDisconnect

from backend.schemas import (
    SDNextGenerationParams,
    SDNextGenerationResult,
    WebSocketSubscription,
)
from backend.services.generation import GenerationCoordinator
from backend.services.websocket import (
    ConnectionManager,
    JobProgressMonitor,
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


class _ScriptedGenerationService:
    """Return a scripted sequence of SD.Next progress results per job."""

    def __init__(self, script: Dict[str, List[SDNextGenerationResult]]) -> None:
        self._script = script
        self.release = asyncio.Event()

    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        # Hold the first poll until the job-started broadcast is out, so the
        # captured order matches what a client sees in practice.
        await self.release.wait()
        return self._script[job_id].pop(0)


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
    service = WebSocketService(
        connection_manager=ConnectionManager(),
        job_monitor=JobProgressMonitor(poll_interval=0.0),
    )
    generation = _ScriptedGenerationService({
        "job-completed": [
            SDNextGenerationResult(
                job_id="job-completed", status="running", progress=0.5
            ),
            SDNextGenerationResult(
                job_id="job-completed",
                status="completed",
                progress=1.0,
                images=[PNG_BASE64],
                generation_info={"seed": 1234},
            ),
        ],
        "job-failed": [
            SDNextGenerationResult(
                job_id="job-failed",
                status="failed",
                error_message="SD.Next returned no images",
            ),
        ],
    })
    coordinator = GenerationCoordinator(
        deliveries=None,  # not used when broadcasting
        websocket=service,
        generation_service=generation,
    )

    subscription = WebSocketSubscription(job_ids=None).model_dump()
    client = _ClientWebSocket()
    connection = asyncio.create_task(service.handle_connection(client))
    client.client_send(subscription)
    await _wait_until(lambda: bool(service.manager.global_subscribers))

    def _completed(job_id: str) -> bool:
        return any(
            msg["type"] == "generation_complete" and msg["data"]["job_id"] == job_id
            for msg in client.sent
        )

    for job_id in ("job-completed", "job-failed"):
        generation.release.clear()
        await coordinator.broadcast_job_started(
            job_id, SDNextGenerationParams(prompt="a lighthouse at dusk")
        )
        generation.release.set()
        await _wait_until(lambda job_id=job_id: _completed(job_id))

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
