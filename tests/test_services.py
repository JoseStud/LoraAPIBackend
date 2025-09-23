"""Tests for the service layer."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest

from backend.delivery.base import DeliveryRegistry
from backend.models.adapters import Adapter
from backend.schemas.adapters import AdapterCreate
from backend.services.composition import CompositionResult
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import QueueBackend, QueueOrchestrator
from backend.workers.delivery_runner import DeliveryRunner


class TestAdapterService:
    """Tests for the AdapterService."""

    def test_validate_file_path_exists(self, adapter_service, mock_storage):
        """Test that validate_file_path returns True when the file exists."""
        mock_storage.exists.return_value = True
        assert adapter_service.validate_file_path("some/path") is True
        mock_storage.exists.assert_called_once_with("some/path")

    def test_validate_file_path_not_exists(self, adapter_service, mock_storage):
        """Test that validate_file_path returns False when the file does not exist."""
        mock_storage.exists.return_value = False
        assert adapter_service.validate_file_path("some/path") is False
        mock_storage.exists.assert_called_once_with("some/path")

    def test_save_adapter(self, adapter_service):
        """Test saving a new adapter."""
        payload = AdapterCreate(
            name="test-adapter",
            version="1.0",
            file_path="/fake/path",
            tags=["test"],
        )
        adapter = adapter_service.save_adapter(payload)
        assert adapter.id is not None
        assert adapter.name == "test-adapter"
        assert adapter.tags == ["test"]

    def test_list_active_ordered(self, adapter_service, db_session):
        """Test listing active adapters in the correct order."""
        # Create some adapters
        a1 = Adapter(
            name="adapter1", weight=0.7, active=True, ordinal=1, file_path="/tmp/1",
        )  # noqa: E501
        a2 = Adapter(
            name="adapter2", weight=0.8, active=True, ordinal=2, file_path="/tmp/2",
        )  # noqa: E501
        a3 = Adapter(
            name="adapter3", weight=0.9, active=False, ordinal=3, file_path="/tmp/3",
        )  # noqa: E501
        db_session.add_all([a1, a2, a3])
        db_session.commit()

        active_adapters = adapter_service.list_active_ordered()
        assert len(active_adapters) == 2
        assert active_adapters[0].name == "adapter1"
        assert active_adapters[1].name == "adapter2"

    def test_search_adapters_filters_and_pagination(self, adapter_service, db_session):
        """Service search applies filters, sorting, and pagination."""

        now = datetime.now(timezone.utc)
        adapters = [
            Adapter(
                name="Alpha",
                active=True,
                tags=["fantasy", "portrait"],
                primary_file_size_kb=150,
                file_path="/tmp/a",
                created_at=now - timedelta(days=3),
                updated_at=now - timedelta(days=2),
            ),
            Adapter(
                name="Beta",
                active=False,
                tags=["sci-fi"],
                primary_file_size_kb=50,
                file_path="/tmp/b",
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(days=1),
            ),
            Adapter(
                name="Gamma",
                active=True,
                tags=["fantasy"],
                primary_file_size_kb=300,
                file_path="/tmp/c",
                created_at=now - timedelta(days=1),
                updated_at=now - timedelta(hours=1),
            ),
        ]
        db_session.add_all(adapters)
        db_session.commit()

        # Filtering by search term, tag, and active state
        first_page = adapter_service.search_adapters(
            search="a",
            active_only=True,
            tags=["fantasy"],
            sort="file_size",
            page=1,
            per_page=1,
        )

        assert first_page.total == 3
        assert first_page.filtered == 2
        assert first_page.page == 1
        assert first_page.per_page == 1
        assert first_page.pages == 2
        assert first_page.items[0].name == "Gamma"

        second_page = adapter_service.search_adapters(
            search="a",
            active_only=True,
            tags=["fantasy"],
            sort="file_size",
            page=2,
            per_page=1,
        )

        assert second_page.total == 3
        assert second_page.filtered == 2
        assert second_page.page == 2
        assert second_page.per_page == 1
        assert second_page.items[0].name == "Alpha"

        # Sorting by updated_at should return most recently updated first
        updated_order = adapter_service.search_adapters(sort="updated_at", per_page=5)
        assert updated_order.total == 3
        assert updated_order.filtered == 3
        assert [adapter.name for adapter in updated_order.items[:3]] == [
            "Gamma",
            "Beta",
            "Alpha",
        ]

    def test_search_adapters_tag_filters_deduplicate_results(self, adapter_service, db_session):
        """Tag filtering occurs at the database level and avoids duplicates."""

        now = datetime.now(timezone.utc)
        adapters = [
            Adapter(
                name="Alpha",
                active=True,
                tags=["Fantasy", "Portrait"],
                file_path="/tmp/a",
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(days=2),
            ),
            Adapter(
                name="Beta",
                active=True,
                tags=["portrait"],
                file_path="/tmp/b",
                created_at=now - timedelta(days=1),
                updated_at=now - timedelta(days=1),
            ),
            Adapter(
                name="Gamma",
                active=True,
                tags=["landscape"],
                file_path="/tmp/c",
                created_at=now - timedelta(hours=1),
                updated_at=now - timedelta(hours=1),
            ),
        ]
        db_session.add_all(adapters)
        db_session.commit()

        result = adapter_service.search_adapters(
            tags=["fantasy", "PORTRAIT"],
            sort="created_at",
            page=1,
            per_page=5,
        )

        names = [adapter.name for adapter in result.items]
        assert names == ["Beta", "Alpha"]
        assert result.total == 3
        assert result.filtered == 2
        assert len(set(names)) == len(names)

    def test_get_all_tags(self, adapter_service, db_session):
        """Unique tags are aggregated and sorted case-insensitively."""

        adapters = [
            Adapter(name="a", tags=["fantasy", "Portrait"], file_path="/tmp/a"),
            Adapter(name="b", tags=["sci-fi"], file_path="/tmp/b"),
            Adapter(name="c", tags="single", file_path="/tmp/c"),
        ]
        db_session.add_all(adapters)
        db_session.commit()

        assert adapter_service.get_all_tags() == ["fantasy", "Portrait", "sci-fi", "single"]

    def test_bulk_adapter_action_activate_and_delete(self, adapter_service, db_session):
        """Bulk actions reuse service helpers and persist state changes."""

        adapters = [
            Adapter(name="one", active=False, file_path="/tmp/1"),
            Adapter(name="two", active=False, file_path="/tmp/2"),
            Adapter(name="three", active=True, file_path="/tmp/3"),
        ]
        db_session.add_all(adapters)
        db_session.commit()

        activate_ids = adapter_service.bulk_adapter_action(
            "activate", [adapters[0].id, adapters[1].id]
        )
        assert set(activate_ids) == {adapters[0].id, adapters[1].id}

        db_session.expire_all()
        assert adapter_service.get_adapter(adapters[0].id).active is True
        assert adapter_service.get_adapter(adapters[1].id).active is True

        deleted_ids = adapter_service.bulk_adapter_action("delete", [adapters[2].id])
        assert deleted_ids == [adapters[2].id]
        assert adapter_service.get_adapter(adapters[2].id) is None

    def test_bulk_adapter_action_rolls_back_on_failure(
        self, adapter_service, db_session, monkeypatch
    ):
        """Failures trigger rollback and propagate errors."""

        adapter = Adapter(name="rollback", active=False, file_path="/tmp/r")
        db_session.add(adapter)
        db_session.commit()

        original_commit = adapter_service.db_session.commit
        original_rollback = adapter_service.db_session.rollback
        called = {"rolled_back": False}

        def failing_commit():
            raise RuntimeError("commit boom")

        def tracking_rollback():
            called["rolled_back"] = True
            return original_rollback()

        monkeypatch.setattr(adapter_service.db_session, "commit", failing_commit)
        monkeypatch.setattr(adapter_service.db_session, "rollback", tracking_rollback)

        with pytest.raises(RuntimeError):
            adapter_service.bulk_adapter_action("activate", [adapter.id])

        assert called["rolled_back"] is True

        monkeypatch.setattr(adapter_service.db_session, "commit", original_commit)
        monkeypatch.setattr(adapter_service.db_session, "rollback", original_rollback)
        adapter_service.db_session.expire_all()
        assert adapter_service.get_adapter(adapter.id).active is False

    def test_patch_adapter_validation(self, adapter_service, db_session):
        """Patch helper enforces allowed fields and value types."""

        adapter = Adapter(name="patch", active=False, weight=1.0, file_path="/tmp/p")
        db_session.add(adapter)
        db_session.commit()

        updated = adapter_service.patch_adapter(adapter.id, {"active": True, "weight": 0.5})
        assert updated.active is True
        assert updated.weight == 0.5

        with pytest.raises(ValueError):
            adapter_service.patch_adapter(adapter.id, {"unknown": 1})

        with pytest.raises(ValueError):
            adapter_service.patch_adapter(adapter.id, {"weight": "heavy"})


class TestDeliveryService:
    """Tests for the DeliveryService."""

    class DummyQueue(QueueBackend):
        """Simple queue backend used for testing enqueue behaviour."""

        def __init__(self, should_fail: bool = False) -> None:
            self.should_fail = should_fail
            self.enqueued = []

        def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):  # type: ignore[override]
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


class TestComposeService:
    """Tests for the ComposeService."""

    def test_format_token(self, compose_service):
        """Test the formatting of a lora token."""
        token = compose_service.format_token("test-lora", 0.75)
        assert token == "<lora:test-lora:0.750>"

    def test_compose_from_adapter_service_builds_prompt(self, compose_service):
        """Helper should compose prompt, tokens, and warnings in one place."""

        adapters = [
            Adapter(name="alpha", file_path="/tmp/a", weight=0.5, active=True),
            Adapter(name="beta", file_path="/tmp/b", weight=0.75, active=True),
        ]

        class DummyAdapterService:
            def __init__(self, items):
                self.items = items
                self.calls = 0

            def list_active_ordered(self):
                self.calls += 1
                return self.items

        dummy_service = DummyAdapterService(adapters)

        result = compose_service.compose_from_adapter_service(
            dummy_service,
            prefix="start",
            suffix="end",
        )

        assert isinstance(result, CompositionResult)
        assert dummy_service.calls == 1
        assert result.tokens == [
            "<lora:alpha:0.500>",
            "<lora:beta:0.750>",
        ]
        assert result.prompt == "start <lora:alpha:0.500> <lora:beta:0.750> end"
        assert result.warnings == []

    def test_compose_from_adapter_service_captures_warnings(self, compose_service):
        """Warnings from validation should propagate through the helper."""

        adapters = [
            Adapter(name="gamma", file_path="/tmp/a", weight=0.0, active=True),
            Adapter(name="gamma", file_path="/tmp/b", weight=0.0, active=True),
        ]

        class DummyAdapterService:
            def list_active_ordered(self):
                return adapters

        result = compose_service.compose_from_adapter_service(
            DummyAdapterService(),
            prefix="start",
            suffix="end",
        )

        assert "Duplicate adapter names" in " ".join(result.warnings)
        assert "Adapters with zero weight" in " ".join(result.warnings)
        assert result.prompt == "start <lora:gamma:0.000> <lora:gamma:0.000> end"

    def test_validate_adapters_reports_each_duplicate_once(self, compose_service):
        """Duplicate adapter warnings should enumerate each repeated name once."""

        adapters = [
            Adapter(name="alpha", file_path="/tmp/a", weight=0.5, active=True),
            Adapter(name="beta", file_path="/tmp/b", weight=0.6, active=True),
            Adapter(name="alpha", file_path="/tmp/c", weight=0.7, active=True),
            Adapter(name="beta", file_path="/tmp/d", weight=0.8, active=True),
            Adapter(name="gamma", file_path="/tmp/e", weight=0.9, active=True),
        ]

        warnings = compose_service.validate_adapters(adapters)

        assert "Duplicate adapter names found: alpha, beta" in warnings
