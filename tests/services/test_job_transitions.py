"""Tests for guarded job status transitions, cancellation and recovery."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import timedelta
from typing import Any, Dict, List, Optional

import pytest

from backend.delivery.base import DeliveryRegistry, GenerationBackend
from backend.delivery.storage import remove_stored_images
from backend.schemas import SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.job_recovery import (
    INTERRUPTED_RESULT,
    JobRecovery,
    recover_jobs,
)
from backend.services.queue import QueueBackend, QueueOrchestrator
from backend.services.websocket import WebSocketService
from backend.workers.delivery_runner import DeliveryRunner
from tests.util.delivery_jobs import set_job_status


class RecordingQueue(QueueBackend):
    """Queue backend that records enqueued job ids."""

    def __init__(self) -> None:
        self.enqueued: List[tuple[str, Any]] = []

    def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
        self.enqueued.append((job_id, background_tasks))
        return job_id


class DurableQueue(RecordingQueue):
    """A queue backend that stands in for Redis."""


def _service(db_session, orchestrator: Optional[QueueOrchestrator] = None):
    return DeliveryService(
        DeliveryJobRepository(db_session), queue_orchestrator=orchestrator
    )


@pytest.fixture
def session_override(monkeypatch, db_session):
    """Make the runner and recovery use the in-memory test session."""

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(
        "backend.core.database.get_session_context", lambda: session_context()
    )
    monkeypatch.setattr(
        "backend.workers.delivery_runner.get_session_context",
        lambda: session_context(),
    )
    monkeypatch.setattr(
        "backend.services.job_recovery.get_session_context",
        lambda: session_context(),
    )


# --- service transitions ----------------------------------------------------


def test_claim_job_only_from_waiting_statuses(db_session):
    service = _service(db_session)
    pending = service.create_job("p", "cli", {})
    retrying = service.create_job("r", "cli", {})
    set_job_status(service, retrying.id, "retrying")
    cancelled = service.create_job("c", "cli", {})
    set_job_status(service, cancelled.id, "cancelled")

    claimed = service.claim_job(pending.id)
    assert claimed is not None and claimed.status == "running"
    assert claimed.started_at is not None
    assert service.claim_job(pending.id) is None, "a second runner must not claim"

    assert service.claim_job(retrying.id).status == "running"
    assert service.claim_job(cancelled.id) is None
    assert service.claim_job("missing") is None


def test_claim_from_retrying_restarts_started_at(db_session):
    """Recovery measures a retried attempt from its own start."""
    service = _service(db_session)
    job = service.create_job("p", "cli", {})
    first = service.claim_job(job.id).started_at
    service.finish_job(job.id, "retrying", {"error": "x", "retries_left": 1})
    stored = service.get_job(job.id)
    stored.started_at = first - timedelta(hours=2)
    db_session.add(stored)
    db_session.commit()

    retried = service.claim_job(job.id)

    assert retried.status == "running"
    assert retried.started_at >= first
    failed = service.fail_running_jobs(
        older_than=timedelta(hours=1), result=INTERRUPTED_RESULT
    )
    assert failed == []


def test_finish_job_keeps_cancelled_status(db_session):
    service = _service(db_session)
    job = service.create_job("p", "cli", {})
    service.claim_job(job.id)
    assert service.cancel_job(job.id) == "running"

    assert service.finish_job(job.id, "succeeded", {"status": "ok"}) is None
    db_session.expire_all()
    stored = service.get_job(job.id)
    assert stored.status == "cancelled"
    assert stored.finished_at is not None
    assert service.get_job_result(stored) == {"status": "cancelled"}


def test_finish_job_records_running_outcome(db_session):
    service = _service(db_session)
    job = service.create_job("p", "cli", {})
    service.claim_job(job.id)

    finished = service.finish_job(job.id, "succeeded", {"status": "ok"})
    assert finished is not None and finished.status == "succeeded"
    assert finished.finished_at is not None
    assert service.get_job_result(finished) == {"status": "ok"}


@pytest.mark.parametrize("status", ["pending", "retrying", "running"])
def test_cancel_job_returns_previous_status(db_session, status):
    service = _service(db_session)
    job = service.create_job("p", "cli", {})
    set_job_status(service, job.id, status)

    assert service.cancel_job(job.id) == status
    assert service.get_job(job.id).status == "cancelled"
    assert service.cancel_job(job.id) is None


@pytest.mark.parametrize("status", ["succeeded", "failed", "cancelled"])
def test_cancel_job_rejects_finished_jobs(db_session, status):
    service = _service(db_session)
    job = service.create_job("p", "cli", {})
    set_job_status(service, job.id, status)

    assert service.cancel_job(job.id) is None
    assert service.get_job(job.id).status == status


def test_fail_running_jobs_respects_age(db_session):
    service = _service(db_session)
    old = service.create_job("old", "cli", {})
    fresh = service.create_job("fresh", "cli", {})
    service.claim_job(old.id)
    service.claim_job(fresh.id)
    stale = service.get_job(old.id)
    stale.started_at = service._repository.mapper.now() - timedelta(hours=2)
    db_session.add(stale)
    db_session.commit()

    failed = service.fail_running_jobs(
        older_than=timedelta(hours=1), result=INTERRUPTED_RESULT
    )

    assert [job.id for job in failed] == [old.id]
    db_session.expire_all()
    assert service.get_job(old.id).status == "failed"
    assert service.get_job(fresh.id).status == "running"


# --- runner -------------------------------------------------------------------


def test_runner_skips_cancelled_pending_job(db_session, session_override, monkeypatch):
    service = _service(db_session)
    job = service.create_job("p", "cli", {})
    service.cancel_job(job.id)

    calls = []

    async def execute(prompt, mode, params):
        calls.append(prompt)
        return {"status": "ok"}

    runner = DeliveryRunner(DeliveryRegistry())
    monkeypatch.setattr(runner, "_execute_delivery_backend", execute)
    runner.process_delivery_job(job.id)

    assert calls == []
    db_session.expire_all()
    assert service.get_job(job.id).status == "cancelled"


def test_cancel_during_run_discards_result(
    db_session, session_override, monkeypatch, tmp_path
):
    service = _service(db_session)
    job = service.create_job("p", "sdnext", {})
    image = tmp_path / "result.png"
    monkeypatch.setattr(
        "backend.delivery.storage.resolve_output_dir", lambda output_dir=None: tmp_path
    )
    notified = []

    async def execute(prompt, mode, params):
        # The user cancels while the backend renders.
        assert service.cancel_job(job.id) == "running"
        image.write_bytes(b"png")
        return {"status": "completed", "images": ["output://result.png"]}

    async def notify(*args):
        notified.append(args)

    runner = DeliveryRunner(DeliveryRegistry())
    monkeypatch.setattr(runner, "_execute_delivery_backend", execute)
    monkeypatch.setattr(runner, "_notify_finished", notify)
    runner.process_delivery_job(job.id)

    db_session.expire_all()
    stored = service.get_job(job.id)
    assert stored.status == "cancelled"
    assert service.get_job_result(stored) == {"status": "cancelled"}
    assert not image.exists()
    assert notified == []


@pytest.mark.anyio
async def test_runner_holds_task_reference_on_running_loop(
    db_session, session_override, monkeypatch
):
    service = _service(db_session)
    job = service.create_job("p", "cli", {})

    async def execute(prompt, mode, params):
        return {"status": "ok"}

    runner = DeliveryRunner(DeliveryRegistry())
    monkeypatch.setattr(runner, "_execute_delivery_backend", execute)

    task = runner.process_delivery_job(job.id)
    assert task is not None
    assert task in runner._pending_tasks

    await task
    await asyncio.sleep(0)
    assert task not in runner._pending_tasks
    assert service.get_job(job.id).status == "succeeded"

    with pytest.raises(RuntimeError):
        runner.process_delivery_job(job.id, raise_on_error=True)


def test_remove_stored_images_stays_inside_output_dir(tmp_path):
    root = tmp_path / "outputs"
    root.mkdir()
    inside = root / "a.png"
    inside.write_bytes(b"x")
    outside = tmp_path / "secret.txt"
    outside.write_bytes(b"x")

    removed = remove_stored_images(
        ["output://a.png", "output://../secret.txt", "data:image/png;base64,AA", 3],
        output_dir=str(root),
    )

    assert removed == [str(inside.resolve())]
    assert not inside.exists()
    assert outside.exists()


# --- coordinator --------------------------------------------------------------


class InterruptibleBackend(GenerationBackend):
    def __init__(self) -> None:
        self.interrupts = 0

    async def generate_image(self, prompt: str, params: Dict[str, Any]):
        return SDNextGenerationResult(job_id="x", status="completed")

    async def check_progress(self, job_id: str):
        return SDNextGenerationResult(job_id=job_id, status="completed")

    def is_available(self) -> bool:
        return True

    async def interrupt(self) -> bool:
        self.interrupts += 1
        return True


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status", "interrupts"), [("running", 1), ("pending", 0), ("retrying", 0)]
)
async def test_coordinator_interrupts_only_running_jobs(
    db_session, monkeypatch, status, interrupts
):
    backend = InterruptibleBackend()
    monkeypatch.setattr(
        "backend.services.generation.get_generation_backend", lambda name: backend
    )
    deliveries = _service(db_session)
    job = deliveries.create_job("p", "sdnext", {})
    set_job_status(deliveries, job.id, status)
    websocket = WebSocketService()
    stopped = []
    monkeypatch.setattr(websocket, "stop_job_monitoring", stopped.append)
    coordinator = GenerationCoordinator(deliveries, websocket, GenerationService())

    assert await coordinator.cancel_job(job.id) is True
    assert backend.interrupts == interrupts
    assert stopped == [job.id]
    assert await coordinator.cancel_job(job.id) is False
    assert backend.interrupts == interrupts


# --- recovery -----------------------------------------------------------------


def _stale(service: DeliveryService, db_session, job_id: str) -> None:
    service.claim_job(job_id)
    job = service.get_job(job_id)
    job.started_at = service._repository.mapper.now() - timedelta(hours=3)
    db_session.add(job)
    db_session.commit()


def test_recover_in_process_restart_fails_running_and_requeues(db_session):
    queue = RecordingQueue()
    orchestrator = QueueOrchestrator(
        fallback_backend=queue, redis_url_factory=lambda: None
    )
    service = _service(db_session, orchestrator)
    running = service.create_job("run", "cli", {"k": 1})
    service.claim_job(running.id)
    first = service.create_job("first", "cli", {})
    second = service.create_job("second", "cli", {})
    set_job_status(service, second.id, "retrying")

    report = recover_jobs(service, at_startup=True, running_timeout=timedelta(hours=1))

    assert [job.job_id for job in report.failed] == [running.id]
    assert report.failed[0].params == {"k": 1}
    assert report.requeued == [first.id, second.id]
    # Requeued jobs go through the orchestrator's fallback (the in-process job
    # runner), never a separate scheduler.
    assert queue.enqueued == [(first.id, None), (second.id, None)]
    db_session.expire_all()
    assert service.get_job(running.id).status == "failed"


def test_recover_with_durable_queue_only_fails_stale_jobs(db_session):
    durable = DurableQueue()
    orchestrator = QueueOrchestrator(primary_backend=durable)
    service = _service(db_session, orchestrator)
    stale = service.create_job("stale", "cli", {})
    _stale(service, db_session, stale.id)
    fresh = service.create_job("fresh", "cli", {})
    service.claim_job(fresh.id)
    waiting = service.create_job("waiting", "cli", {})

    report = recover_jobs(service, at_startup=True, running_timeout=timedelta(hours=1))

    assert [job.job_id for job in report.failed] == [stale.id]
    assert report.requeued == []
    assert durable.enqueued == []
    db_session.expire_all()
    assert service.get_job(fresh.id).status == "running"
    assert service.get_job(waiting.id).status == "pending"


def test_recover_periodic_pass_does_not_requeue(db_session):
    queue = RecordingQueue()
    service = _service(
        db_session,
        QueueOrchestrator(fallback_backend=queue, redis_url_factory=lambda: None),
    )
    running = service.create_job("run", "cli", {})
    service.claim_job(running.id)
    service.create_job("waiting", "cli", {})

    report = recover_jobs(service, at_startup=False, running_timeout=timedelta(hours=1))

    assert report.failed == [] and report.requeued == []
    assert queue.enqueued == []


class RecordingNotifier:
    def __init__(self) -> None:
        self.sent: List[Dict[str, Any]] = []

    def build_payload(self, job_id, status, prompt, params, result):
        return {"job_id": job_id, "status": status, "result": result}

    async def send(self, payload):
        self.sent.append(payload)


@pytest.mark.anyio
async def test_job_recovery_run_once_notifies_failed_jobs(db_session, session_override):
    service = _service(db_session, QueueOrchestrator(primary_backend=DurableQueue()))
    stale = service.create_job("stale", "cli", {})
    _stale(service, db_session, stale.id)
    notifier = RecordingNotifier()
    recovery = JobRecovery(
        interval_seconds=0,
        running_timeout=timedelta(hours=1),
        deliveries_factory=lambda session: service,
        notifier_factory=lambda: notifier,
    )

    try:
        report = await recovery.run_once(at_startup=False)
    finally:
        await recovery.stop()

    assert [job.job_id for job in report.failed] == [stale.id]
    assert notifier.sent == [
        {"job_id": stale.id, "status": "failed", "result": INTERRUPTED_RESULT}
    ]


@pytest.mark.anyio
async def test_job_recovery_loop_runs_at_startup_and_stops(monkeypatch):
    recovery = JobRecovery(interval_seconds=3600, running_timeout=timedelta(hours=1))
    passes: List[bool] = []

    async def run_once(*, at_startup):
        passes.append(at_startup)

    monkeypatch.setattr(recovery, "run_once", run_once)
    # The autouse fixture stubs start() for lifespan tests; drive the loop here.
    recovery._task = asyncio.create_task(recovery._run())
    await asyncio.sleep(0)
    await recovery.stop()

    assert passes == [True]
    assert recovery._task is None
