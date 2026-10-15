"""Tests for queueing recommendation jobs on Redis/RQ and in the job store."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.schemas.recommendations import IndexRebuildResponse
from backend.services import get_service_container_builder
from backend.services.queue import QueueOrchestrator, RedisQueueBackend
from backend.services.recommendation_jobs import (
    InProcessJobRecord,
    RecommendationJobService,
    RecommendationJobStore,
)
from backend.workers import tasks as worker_tasks
from tests.util.in_process_jobs import drain_in_process_jobs


class _FakeEmbeddings:
    def __init__(self) -> None:
        self.error: Exception | None = None
        self.calls: list[tuple] = []

    def refresh_similarity_index(self, *, force=False):
        self.calls.append(("rebuild", force))
        if self.error is not None:
            raise self.error
        return IndexRebuildResponse(
            status="rebuilt",
            indexed_items=5,
            index_path="/tmp/index",
            processing_time_seconds=0.1,
            rebuilt_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )

    def compute_for_lora(self, adapter_id, *, force_recompute=False):
        self.calls.append(("single", adapter_id, force_recompute))
        return True


@pytest.fixture
def embeddings(db_session, monkeypatch: pytest.MonkeyPatch) -> _FakeEmbeddings:
    """Stub the recommendation service and point worker sessions at the test DB."""
    fake = _FakeEmbeddings()
    service = SimpleNamespace(embeddings=fake, gpu_enabled=False)
    builder = get_service_container_builder()
    monkeypatch.setattr(
        builder,
        "_factories",
        replace(builder._factories, recommendation=lambda session, **_: service),
    )

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(worker_tasks, "get_session_context", session_context)
    return fake


class TestRedisQueue:
    """With Redis, jobs are RQ jobs and RQ keeps their status and result."""

    @pytest.fixture
    def redis_queue(self, monkeypatch: pytest.MonkeyPatch):
        fakeredis = pytest.importorskip("fakeredis")
        from rq import Queue

        connection = fakeredis.FakeStrictRedis()
        queue = Queue("default", connection=connection)
        backend = RedisQueueBackend("redis://localhost:6379/0")
        monkeypatch.setattr(backend, "_queue", queue, raising=False)
        orchestrator = QueueOrchestrator(primary_backend=backend)

        worker_tasks.set_worker_context(
            worker_tasks.build_worker_context(
                queue_orchestrator=orchestrator, recommendation_gpu_available=False
            )
        )
        yield SimpleNamespace(
            queue=queue,
            connection=connection,
            service=RecommendationJobService(orchestrator, gpu_available=False),
        )
        worker_tasks.reset_worker_context()

    def _work(self, redis_queue) -> None:
        from rq import SimpleWorker

        worker = SimpleWorker([redis_queue.queue], connection=redis_queue.connection)
        worker.work(burst=True)

    def test_job_runs_on_the_rq_worker(self, redis_queue, embeddings):
        queued = redis_queue.service.enqueue_index_rebuild(force=True)

        assert queued.status == "queued"
        rq_job = redis_queue.queue.fetch_job(queued.job_id)
        assert rq_job.func_name == "backend.workers.tasks.rebuild_similarity_index"
        assert rq_job.kwargs == {"force": True}
        assert redis_queue.service.get_job(queued.job_id).status == "queued"
        assert embeddings.calls == []

        self._work(redis_queue)

        job = redis_queue.service.get_job(queued.job_id)
        assert job.status == "succeeded"
        assert job.kind == "index_rebuild"
        assert job.result is not None
        assert job.result.indexed_items == 5
        assert job.finished_at is not None
        assert embeddings.calls == [("rebuild", True)]

    def test_single_embedding_result_is_read_from_rq(self, redis_queue, embeddings):
        queued = redis_queue.service.enqueue_embedding("adapter-1")

        self._work(redis_queue)

        job = redis_queue.service.get_job(queued.job_id)
        assert job.status == "succeeded"
        assert job.result.message == "Embeddings computed for adapter-1"

    def test_failed_rq_job_reports_a_generic_error(self, redis_queue, embeddings):
        embeddings.error = RuntimeError("secret detail")
        queued = redis_queue.service.enqueue_index_rebuild()

        self._work(redis_queue)

        job = redis_queue.service.get_job(queued.job_id)
        assert job.status == "failed"
        assert job.result is None
        assert job.error == "Index rebuild failed"

    def test_other_rq_jobs_are_not_reported(self, redis_queue):
        delivery_job = redis_queue.queue.enqueue_call(
            "backend.workers.tasks.process_delivery", args=("delivery-1",)
        )

        assert redis_queue.service.get_job(delivery_job.id) is None
        assert redis_queue.service.get_job("0" * 32) is None

    def test_enqueue_failure_falls_back_to_in_process(
        self, redis_queue, embeddings, monkeypatch: pytest.MonkeyPatch
    ):
        def fail(*args, **kwargs):
            raise ConnectionError("redis down")

        monkeypatch.setattr(redis_queue.queue, "enqueue_call", fail)

        queued = redis_queue.service.enqueue_index_rebuild()
        drain_in_process_jobs()

        job = redis_queue.service.get_job(queued.job_id)
        assert job.status == "succeeded"
        assert embeddings.calls == [("rebuild", False)]


class TestRecommendationJobStore:
    """The in-memory store forgets finished jobs by age and by count."""

    def _finished(self, store: RecommendationJobStore, job_id: str) -> None:
        store.add(InProcessJobRecord(job_id=job_id, kind="index_rebuild", params={}))
        store.mark_succeeded(job_id, {})

    def test_drops_oldest_finished_jobs_beyond_the_limit(self):
        store = RecommendationJobStore(max_finished=2)
        store.add(InProcessJobRecord(job_id="active", kind="embedding", params={}))
        for job_id in ("a", "b", "c"):
            self._finished(store, job_id)

        assert store.get("a") is None
        assert store.get("b") is not None
        assert store.get("c") is not None
        # Jobs that have not finished are never dropped.
        assert store.get("active") is not None
        assert len(store) == 3

    def test_drops_finished_jobs_after_the_ttl(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        clock = SimpleNamespace(now=now)
        store = RecommendationJobStore(
            ttl=timedelta(minutes=5), clock=lambda: clock.now
        )
        self._finished(store, "old")

        clock.now = now + timedelta(minutes=6)

        assert store.get("old") is None

    def test_final_status_is_not_overwritten(self):
        store = RecommendationJobStore()
        self._finished(store, "done")

        store.mark_failed("done")
        store.mark_running("done")

        assert store.get("done").status == "succeeded"

    def test_job_dropped_by_a_stopped_runner_is_failed(self):
        from backend.services.in_process_jobs import InProcessJobRunner

        runner = InProcessJobRunner(thread_name="recommendation-jobs-test")
        store = RecommendationJobStore()
        service = RecommendationJobService(
            QueueOrchestrator(redis_url_factory=lambda: None),
            gpu_available=False,
            job_runner=runner,
            store=store,
        )
        blocker = runner.submit(lambda _job_id: _block_forever(), "blocker")

        queued = service.enqueue_index_rebuild()
        runner.stop()

        assert blocker.done()
        assert service.get_job(queued.job_id).status == "failed"


async def _block_forever() -> None:
    import asyncio

    await asyncio.Event().wait()
