"""Tests for recommendation worker tasks."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.schemas.recommendations import IndexRebuildResponse
from backend.services import (
    get_service_container_builder,
    service_container_builder_scope,
)
from backend.services.queue import QueueOrchestrator
from backend.workers import tasks as worker_tasks
from backend.workers.context import WorkerContext


class _FakeEmbeddings:
    def __init__(self, response=None, error=None):
        self.calls = []
        self._response = response
        self._error = error

    async def refresh_similarity_index(self, *, force=False):
        self.calls.append(force)
        if self._error is not None:
            raise self._error
        return self._response


@pytest.fixture
def worker_context(db_session, monkeypatch):
    """Build a worker context whose sessions use the in-memory test database."""

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(worker_tasks, "get_session_context", session_context)
    return WorkerContext(
        queue_orchestrator=QueueOrchestrator(redis_url_factory=lambda: None),
        recommendation_gpu_available=False,
    )


@contextmanager
def _recommendation_override(embeddings):
    """Scope a builder whose recommendation service exposes ``embeddings``."""
    fake_service = SimpleNamespace(embeddings=embeddings)
    builder = get_service_container_builder().with_overrides(
        domain=lambda factories: replace(
            factories,
            recommendation=lambda db_session, **kwargs: fake_service,
        ),
    )
    with service_container_builder_scope(builder):
        yield


def test_rebuild_similarity_index_delegates_to_embedding_coordinator(
    worker_context,
):
    """The task runs the real refresh and returns the response as a dict."""
    response = IndexRebuildResponse(
        status="rebuilt",
        indexed_items=3,
        index_path="/tmp/index",
        index_size_bytes=42,
        processing_time_seconds=0.5,
        rebuilt_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    embeddings = _FakeEmbeddings(response=response)

    with _recommendation_override(embeddings):
        result = worker_tasks.rebuild_similarity_index(
            force=True, context=worker_context
        )

    assert embeddings.calls == [True]
    assert result == response.model_dump()
    assert result["status"] == "rebuilt"


def test_rebuild_similarity_index_propagates_failures(worker_context):
    """Failures are re-raised so the queue records the job as failed."""
    embeddings = _FakeEmbeddings(error=RuntimeError("index unavailable"))

    with _recommendation_override(embeddings), pytest.raises(RuntimeError):
        worker_tasks.rebuild_similarity_index(context=worker_context)

    assert embeddings.calls == [False]
