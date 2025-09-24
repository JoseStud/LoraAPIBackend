"""Tests for the DeliveryService."""

from contextlib import contextmanager
from datetime import datetime, timezone

import pytest

from backend.delivery.base import DeliveryRegistry
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import (
    DeliveryJobMapper,
    DeliveryJobRepository,
)
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

    def test_list_jobs_by_statuses_filters_and_orders(
        self, delivery_service: DeliveryService, db_session
    ):
        """Jobs are filtered by status and ordered by started/created timestamps."""
        running_new = delivery_service.create_job("prompt-a", "cli", {})
        running_old = delivery_service.create_job("prompt-b", "cli", {})
        pending_job = delivery_service.create_job("prompt-c", "cli", {})
        finished_job = delivery_service.create_job("prompt-d", "cli", {})

        running_new.status = "running"
        running_new.created_at = datetime(2024, 1, 1, 10, 0, 0)
        running_new.started_at = datetime(2024, 1, 1, 16, 0, 0)

        running_old.status = "running"
        running_old.created_at = datetime(2024, 1, 1, 9, 0, 0)
        running_old.started_at = datetime(2024, 1, 1, 14, 0, 0)

        pending_job.status = "pending"
        pending_job.created_at = datetime(2024, 1, 1, 15, 0, 0)

        finished_job.status = "succeeded"
        finished_job.created_at = datetime(2024, 1, 1, 20, 0, 0)

        db_session.add_all([running_new, running_old, pending_job, finished_job])
        db_session.commit()

        jobs = delivery_service.list_jobs_by_statuses(
            ["running", "pending", "running"], limit=10
        )

        assert [job.id for job in jobs] == [
            running_new.id,
            pending_job.id,
            running_old.id,
        ]

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

    def test_set_job_rating_tracks_timestamp(self, db_session):
        """Setting and clearing ratings updates timestamp metadata."""
        rating_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mapper = DeliveryJobMapper(now=lambda: rating_time)
        repository = DeliveryJobRepository(db_session, mapper=mapper)
        service = DeliveryService(repository)

        job = service.create_job("prompt", "cli", {})

        updated = service.set_job_rating(job.id, 4)
        assert updated is not None
        assert updated.rating == 4
        assert updated.rating_updated_at == rating_time.replace(tzinfo=None)

        mapper._now = lambda: rating_time.replace(hour=2)
        cleared = service.set_job_rating(job.id, None)
        assert cleared is not None
        assert cleared.rating is None
        assert cleared.rating_updated_at is None

    def test_set_job_rating_validates_bounds(self, db_session):
        """Ratings outside 0-5 raise a ValueError."""
        service = DeliveryService(DeliveryJobRepository(db_session))
        job = service.create_job("prompt", "cli", {})

        with pytest.raises(ValueError):
            service.set_job_rating(job.id, 6)

    def test_set_job_favorite_tracks_timestamp(self, db_session):
        """Toggling favourites stores timestamps and clears them when removed."""
        favorite_time = datetime(2024, 1, 2, tzinfo=timezone.utc)
        mapper = DeliveryJobMapper(now=lambda: favorite_time)
        repository = DeliveryJobRepository(db_session, mapper=mapper)
        service = DeliveryService(repository)

        job = service.create_job("prompt", "cli", {})

        updated = service.set_job_favorite(job.id, True)
        assert updated is not None
        assert updated.is_favorite is True
        assert updated.favorite_updated_at == favorite_time.replace(tzinfo=None)

        mapper._now = lambda: favorite_time.replace(hour=5)
        cleared = service.set_job_favorite(job.id, False)
        assert cleared is not None
        assert cleared.is_favorite is False
        assert cleared.favorite_updated_at is None

    def test_bulk_set_job_favorite_updates_all(self, db_session):
        """Bulk favourite updates apply to all provided jobs."""
        bulk_time = datetime(2024, 1, 3, tzinfo=timezone.utc)
        mapper = DeliveryJobMapper(now=lambda: bulk_time)
        repository = DeliveryJobRepository(db_session, mapper=mapper)
        service = DeliveryService(repository)

        first = service.create_job("first", "cli", {})
        second = service.create_job("second", "cli", {})

        updated_count = service.bulk_set_job_favorite([first.id, second.id], True)
        assert updated_count == 2

        refreshed_first = service.get_job(first.id)
        refreshed_second = service.get_job(second.id)

        assert refreshed_first is not None and refreshed_first.is_favorite is True
        assert refreshed_second is not None and refreshed_second.is_favorite is True
        expected_time = bulk_time.replace(tzinfo=None)
        assert refreshed_first.favorite_updated_at == expected_time
        assert refreshed_second.favorite_updated_at == expected_time
