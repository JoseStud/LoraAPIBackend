"""Shared helpers and fixtures for API tests."""

from __future__ import annotations

import uuid
from typing import Callable
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.services.queue import QueueBackend


class RecordingQueueBackend(QueueBackend):
    """Queue backend that records enqueue calls for assertions."""

    def __init__(self) -> None:
        self.calls = []

    def enqueue_delivery(self, job_id: str, *, background_tasks=None, **enqueue_kwargs):
        self.calls.append(
            {
                "job_id": job_id,
                "background_tasks": background_tasks,
                "enqueue_kwargs": enqueue_kwargs,
            }
        )


class FailingQueueBackend(QueueBackend):
    """Queue backend that always raises to force fallback usage."""

    def __init__(self) -> None:
        self.attempts = 0

    def enqueue_delivery(self, job_id: str, *, background_tasks=None, **enqueue_kwargs):
        self.attempts += 1
        raise RuntimeError("primary queue failed")


@pytest.fixture
def recording_queue_backend() -> RecordingQueueBackend:
    """Provide a recording queue backend instance."""
    return RecordingQueueBackend()


@pytest.fixture
def failing_queue_backend() -> FailingQueueBackend:
    """Provide a failing queue backend instance."""
    return FailingQueueBackend()


@pytest.fixture
def create_active_adapter(
    mock_storage: MagicMock,
) -> Callable[[TestClient], str]:
    """Create an active adapter via the API and return its identifier."""

    def _create(client: TestClient) -> str:
        mock_storage.exists.return_value = True
        name = "test-" + uuid.uuid4().hex
        data = {
            "name": name,
            "version": "v1",
            "file_path": "/fake/path",
            "weight": 1.0,
        }
        response = client.post("/api/v1/adapters", json=data)
        response.raise_for_status()
        adapter_id = response.json()["adapter"]["id"]

        activate_response = client.post(f"/api/v1/adapters/{adapter_id}/activate")
        activate_response.raise_for_status()

        return adapter_id

    return _create
