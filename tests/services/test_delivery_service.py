"""Tests for the DeliveryService."""

from contextlib import contextmanager

import pytest

from backend.delivery.base import DeliveryRegistry
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import QueueBackend, QueueOrchestrator
from backend.workers.delivery_runner import DeliveryRunner


class TestDeliveryService:
    """Tests for the DeliveryService."""

    class DummyQueue(QueueBackend):
        """Simple queue backend used for testing enqueue behaviour."""

        def __init__(self, should_fail: bool = False) -> None:
            self.should_fail = should_fail
            self.enqueued = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
            if self.should_fail:
                raise RuntimeError("queue failure")
            self.enqueued.append((job_id, background_tasks, enqueue_kwargs))
            return job_id

    @staticmethod
    def _override_session(monkeypatch, db_session):
        """Force delivery job processing to use the in-memory test session."""

        @contextmanager
        def session_context():
            yield db_session

        monkeypatch.setattr(
            "backend.core.database.get_session_context",
            lambda: session_context(),
        )

    @staticmethod
    def _make_runner() -> DeliveryRunner:
        """Create a delivery runner bound to an isolated registry."""
        return DeliveryRunner(DeliveryRegistry())

    def test_create_job(self, delivery_service):
        """Test creating a new delivery job."""
        job = delivery_service.create_job(
            prompt="test prompt",
            mode="http",
            params={"url": "http://test.com"},
        )
        assert job.id is not None
        assert job.prompt == "test prompt"
        assert job.status == "pending"

    def test_schedule_job_uses_primary_queue(self, db_session):
        """Primary queue is used when available and succeeds."""
        primary = self.DummyQueue()
        fallback = self.DummyQueue()
        repository = DeliveryJobRepository(db_session)
        orchestrator = QueueOrchestrator(
            primary_backend=primary,
            fallback_backend=fallback,
        )
        service = DeliveryService(
            repository,
            queue_orchestrator=orchestrator,
        )

        job = service.schedule_job("prompt", "cli", {"foo": "bar"})

        assert job.id == primary.enqueued[0][0]
        assert fallback.enqueued == []

    def test_schedule_job_falls_back_when_primary_fails(self, db_session):
        """Fallback queue is invoked when the primary queue raises."""
        primary = self.DummyQueue(should_fail=True)
        fallback = self.DummyQueue()
        repository = DeliveryJobRepository(db_session)
        orchestrator = QueueOrchestrator(
            primary_backend=primary,
            fallback_backend=fallback,
        )
        service = DeliveryService(
            repository,
            queue_orchestrator=orchestrator,
        )

        job = service.schedule_job("prompt", "cli", {"bar": 1})

        assert job.id == fallback.enqueued[0][0]
        assert primary.enqueued == []

    def test_process_delivery_job_success(self, db_session, monkeypatch):
        """Processing a delivery job marks it as succeeded with the result."""
        service = DeliveryService(DeliveryJobRepository(db_session))
        job = service.create_job("p", "cli", {"key": "value"})

        self._override_session(monkeypatch, db_session)

        async def fake_execute(prompt, mode, params):
            assert prompt == "p"
            assert mode == "cli"
            assert params == {"key": "value"}
            return {"status": "ok", "result": True}

        runner = self._make_runner()
        monkeypatch.setattr(runner, "_execute_delivery_backend", fake_execute)

        runner.process_delivery_job(job.id)

        db_session.expire_all()
        refreshed = service.get_job(job.id)
        assert refreshed is not None
        assert refreshed.status == "succeeded"
        result = service.get_job_result(refreshed)
        assert result == {"status": "ok", "result": True}

    def test_process_delivery_job_failure_sets_retry(self, db_session, monkeypatch):
        """Failures with retries left set the job to retrying."""
        service = DeliveryService(DeliveryJobRepository(db_session))
        job = service.create_job("p", "cli", {"key": "value"})

        self._override_session(monkeypatch, db_session)

        async def failing_execute(prompt, mode, params):
            raise RuntimeError("boom")

        runner = self._make_runner()
        monkeypatch.setattr(runner, "_execute_delivery_backend", failing_execute)

        runner.process_delivery_job(job.id, retries_left=2)

        db_session.expire_all()
        refreshed = service.get_job(job.id)
        assert refreshed is not None
        assert refreshed.status == "retrying"
        result = service.get_job_result(refreshed)
        assert result is not None
        assert result["error"] == "boom"
        assert result["retries_left"] == 2

    def test_process_delivery_job_raises_when_requested(self, db_session, monkeypatch):
        """raise_on_error propagates the original exception."""
        service = DeliveryService(DeliveryJobRepository(db_session))
        job = service.create_job("p", "cli", {})

        self._override_session(monkeypatch, db_session)

        async def failing_execute(prompt, mode, params):
            raise RuntimeError("explode")

        runner = self._make_runner()
        monkeypatch.setattr(runner, "_execute_delivery_backend", failing_execute)

        with pytest.raises(RuntimeError):
            runner.process_delivery_job(job.id, raise_on_error=True)

        db_session.expire_all()
        refreshed = service.get_job(job.id)
        assert refreshed is not None
        assert refreshed.status == "failed"
        result = service.get_job_result(refreshed)
        assert result is not None
        assert result["error"] == "explode"
