"""API tests for queued recommendation jobs (embeddings and index rebuilds).

Without Redis the jobs run on the in-process job runner, held behind the
``in_process_jobs`` gate until the test lets them run.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.schemas.recommendations import IndexRebuildResponse
from backend.services import get_service_container_builder
from tests.util.in_process_jobs import InProcessJobGate


class _FakeEmbeddings:
    """Stand-in for the embedding coordinator; the ML stack is not installed."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.error: Exception | None = None
        self.single_result = True

    def _maybe_fail(self) -> None:
        if self.error is not None:
            raise self.error

    def compute_batch(self, adapter_ids=None, *, force_recompute, batch_size):
        self.calls.append(("batch", adapter_ids, force_recompute, batch_size))
        self._maybe_fail()
        return {
            "processed_count": 2,
            "skipped_count": 1,
            "error_count": 0,
            "processing_time_seconds": 0.25,
            "errors": [],
            "completed_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        }

    def compute_for_lora(self, adapter_id, *, force_recompute=False):
        self.calls.append(("single", adapter_id, force_recompute))
        self._maybe_fail()
        return self.single_result

    def refresh_similarity_index(self, *, force=False):
        self.calls.append(("rebuild", force))
        self._maybe_fail()
        return IndexRebuildResponse(
            status="rebuilt",
            indexed_items=3,
            index_path="/tmp/index",
            index_size_bytes=42,
            processing_time_seconds=0.5,
            rebuilt_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )


@pytest.fixture
def embeddings(monkeypatch: pytest.MonkeyPatch) -> _FakeEmbeddings:
    """Serve a stub recommendation service from the test's builder."""
    fake = _FakeEmbeddings()
    service = SimpleNamespace(embeddings=fake, gpu_enabled=False)
    builder = get_service_container_builder()
    monkeypatch.setattr(
        builder,
        "_factories",
        replace(builder._factories, recommendation=lambda session, **_: service),
    )
    monkeypatch.setattr(builder, "_recommendation_gpu_detector", lambda: False)
    return fake


def _poll(client: TestClient, job_id: str) -> dict:
    response = client.get(f"/api/v1/recommendations/jobs/{job_id}")
    assert response.status_code == 200
    return response.json()


def test_batch_embeddings_are_queued_and_polled_to_completion(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
):
    response = client.post(
        "/api/v1/recommendations/embeddings/compute",
        json={"adapter_ids": ["a", "b"], "force_recompute": True, "batch_size": 8},
    )

    assert response.status_code == 202
    queued = response.json()
    assert queued["kind"] == "embeddings_batch"
    assert queued["status"] == "queued"
    assert queued["result"] is None
    # The request returned before any work ran.
    assert embeddings.calls == []
    assert _poll(client, queued["job_id"])["status"] == "queued"

    in_process_jobs.run_queued_jobs()

    job = _poll(client, queued["job_id"])
    assert job["status"] == "succeeded"
    assert job["error"] is None
    assert job["started_at"] is not None
    assert job["finished_at"] is not None
    assert job["result"] == {
        "processed_count": 2,
        "skipped_count": 1,
        "error_count": 0,
        "processing_time_seconds": 0.25,
        "errors": [],
        "completed_at": "2026-01-01T00:00:00Z",
    }
    assert embeddings.calls == [("batch", ["a", "b"], True, 8)]


def test_compute_all_queues_every_adapter(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
):
    response = client.post(
        "/api/v1/recommendations/embeddings/compute",
        json={"adapter_ids": ["ignored"], "compute_all": True},
    )
    assert response.status_code == 202

    in_process_jobs.run_queued_jobs()

    assert embeddings.calls == [("batch", None, False, 32)]


def test_single_embedding_is_queued_and_polled_to_completion(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
    create_active_adapter,
):
    adapter_id = create_active_adapter(client)

    response = client.post(
        f"/api/v1/recommendations/embeddings/{adapter_id}/compute",
        params={"force_recompute": "true"},
    )

    assert response.status_code == 202
    queued = response.json()
    assert queued["kind"] == "embedding"
    assert queued["status"] == "queued"

    in_process_jobs.run_queued_jobs()

    job = _poll(client, queued["job_id"])
    assert job["status"] == "succeeded"
    assert job["result"] == {
        "status": "success",
        "message": f"Embeddings computed for {adapter_id}",
    }
    assert embeddings.calls == [("single", adapter_id, True)]


def test_single_embedding_for_unknown_adapter_is_404(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
    mock_storage,
):
    response = client.post("/api/v1/recommendations/embeddings/missing/compute")

    assert response.status_code == 404
    in_process_jobs.run_queued_jobs()
    assert embeddings.calls == []


def test_single_embedding_reporting_failure_marks_job_failed(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
    create_active_adapter,
):
    adapter_id = create_active_adapter(client)
    embeddings.single_result = False

    response = client.post(f"/api/v1/recommendations/embeddings/{adapter_id}/compute")
    assert response.status_code == 202

    in_process_jobs.run_queued_jobs()

    job = _poll(client, response.json()["job_id"])
    assert job["status"] == "failed"
    assert job["result"] is None
    assert job["error"] == "Embedding computation failed"


def test_index_rebuild_is_queued_and_polled_to_completion(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
):
    response = client.post(
        "/api/v1/recommendations/index/rebuild", params={"force": "true"}
    )

    assert response.status_code == 202
    queued = response.json()
    assert queued["kind"] == "index_rebuild"

    in_process_jobs.run_queued_jobs()

    job = _poll(client, queued["job_id"])
    assert job["status"] == "succeeded"
    assert job["result"]["status"] == "rebuilt"
    assert job["result"]["indexed_items"] == 3
    assert job["result"]["rebuilt_at"] == "2026-01-01T00:00:00Z"
    assert embeddings.calls == [("rebuild", True)]


def test_failed_job_reports_a_generic_error(
    client: TestClient,
    in_process_jobs: InProcessJobGate,
    embeddings: _FakeEmbeddings,
):
    embeddings.error = RuntimeError("secret /models/path exploded")

    response = client.post("/api/v1/recommendations/index/rebuild")
    assert response.status_code == 202

    in_process_jobs.run_queued_jobs()

    poll = client.get(f"/api/v1/recommendations/jobs/{response.json()['job_id']}")
    assert poll.status_code == 200
    job = poll.json()
    assert job["status"] == "failed"
    assert job["result"] is None
    assert job["error"] == "Index rebuild failed"
    assert "secret" not in poll.text


@pytest.mark.parametrize("job_id", [uuid.uuid4().hex, "not-a-job-id"])
def test_unknown_job_is_404(client: TestClient, job_id: str):
    response = client.get(f"/api/v1/recommendations/jobs/{job_id}")

    assert response.status_code == 404
