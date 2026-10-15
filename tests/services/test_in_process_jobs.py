"""In-process delivery jobs run one at a time on one long-lived event loop."""

from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import CancelledError
from typing import Any, Dict, List, Tuple

import pytest

from backend.delivery.base import DeliveryRegistry, GenerationBackend
from backend.delivery.http_client import DeliveryHTTPClient
from backend.schemas import SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.in_process_jobs import (
    InProcessJobRunner,
    get_in_process_job_runner,
)
from backend.services.queue import BackgroundTaskQueueBackend, QueueOrchestrator
from backend.workers.delivery_runner import DeliveryRunner
from tests.util.in_process_jobs import drain_in_process_jobs
from tests.util.local_http import serve_json


class RecordingHTTPBackend(GenerationBackend):
    """Generation backend that talks HTTP through one shared client, like SDNext."""

    def __init__(self, client: DeliveryHTTPClient) -> None:
        self.client = client
        self.runs: List[Tuple[str, float, float]] = []
        self.loops: List[asyncio.AbstractEventLoop] = []

    async def generate_image(self, prompt: str, params: Dict[str, Any]):
        started = time.monotonic()
        self.loops.append(asyncio.get_running_loop())
        await asyncio.sleep(0.05)
        healthy = await self.client.health_check()
        self.runs.append((prompt, started, time.monotonic()))
        if not healthy:
            return SDNextGenerationResult(
                job_id=prompt, status="failed", error_message="SDNext unavailable"
            )
        return SDNextGenerationResult(job_id=prompt, status="completed")

    async def check_progress(self, job_id: str):
        return SDNextGenerationResult(job_id=job_id, status="completed")

    def is_available(self) -> bool:
        return True


def _delivery_service(session) -> DeliveryService:
    return DeliveryService(DeliveryJobRepository(session))


def test_in_process_jobs_run_one_after_another(db_session):
    """Two queued jobs never overlap, and the second one succeeds too.

    Before, each job ran under its own ``asyncio.run`` on a request thread:
    jobs overlapped on SDNext, and the shared HTTP client's session was bound
    to the first job's closed loop, so later jobs failed their health check.
    """
    with serve_json() as base_url:
        client = DeliveryHTTPClient(base_url, timeout=5)
        backend = RecordingHTTPBackend(client)
        registry = DeliveryRegistry()
        registry.register_generation_backend("sdnext", backend)
        runner = DeliveryRunner(registry, delivery_service_factory=_delivery_service)
        orchestrator = QueueOrchestrator(
            redis_url_factory=lambda: None,
            delivery_runner_factory=lambda: runner,
        )
        service = DeliveryService(
            DeliveryJobRepository(db_session), queue_orchestrator=orchestrator
        )
        first = service.create_job("first", "sdnext", {})
        second = service.create_job("second", "sdnext", {})

        service.enqueue_job(first.id)
        service.enqueue_job(second.id)
        drain_in_process_jobs()
        # Close the runner loop's session on that loop.
        get_in_process_job_runner().submit(lambda _: client.close(), "close").result(5)

    assert [prompt for prompt, _, _ in backend.runs] == ["first", "second"]
    (_, _, first_end), (_, second_start, _) = backend.runs
    assert first_end <= second_start, "in-process jobs overlapped"
    assert backend.loops[0] is backend.loops[1], "jobs share one event loop"

    db_session.expire_all()
    assert service.get_job(first.id).status == "succeeded"
    assert service.get_job(second.id).status == "succeeded"


def test_runner_is_fifo_and_never_overlaps():
    job_runner = InProcessJobRunner()
    active = 0
    max_active = 0
    order: List[str] = []
    threads = set()

    async def job(job_id: str) -> None:
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        threads.add(threading.current_thread().name)
        await asyncio.sleep(0.01)
        order.append(job_id)
        active -= 1

    # Submit from several threads at once, as concurrent requests would.
    submitters = [
        threading.Thread(target=lambda i=i: job_runner.submit(job, f"job-{i}"))
        for i in range(5)
    ]
    try:
        for thread in submitters:
            thread.start()
        for thread in submitters:
            thread.join()
        drain_in_process_jobs(job_runner)
    finally:
        job_runner.stop()

    assert sorted(order) == [f"job-{i}" for i in range(5)]
    assert max_active == 1
    assert threads == {"delivery-jobs"}

    ordered_runner = InProcessJobRunner()
    ordered: List[str] = []
    try:
        for i in range(5):
            ordered_runner.submit(ordered.append, f"job-{i}")
        drain_in_process_jobs(ordered_runner)
    finally:
        ordered_runner.stop()
    assert ordered == [f"job-{i}" for i in range(5)]


def test_failing_job_does_not_stop_the_runner():
    job_runner = InProcessJobRunner()

    def explode(job_id: str) -> None:
        raise RuntimeError("boom")

    try:
        failed = job_runner.submit(explode, "bad")
        succeeded = job_runner.submit(lambda job_id: job_id, "good")
        with pytest.raises(RuntimeError, match="boom"):
            failed.result(timeout=5)
        assert succeeded.result(timeout=5) is None
    finally:
        job_runner.stop()


def test_stop_drops_queued_jobs_and_restarts_lazily():
    job_runner = InProcessJobRunner()
    started = threading.Event()
    ran: List[str] = []

    async def block(job_id: str) -> None:
        started.set()
        await asyncio.sleep(60)

    running = job_runner.submit(block, "running")
    queued = job_runner.submit(ran.append, "queued")
    assert started.wait(5)

    job_runner.stop()

    with pytest.raises(CancelledError):
        running.result(timeout=5)
    assert queued.cancelled()
    assert ran == []

    try:
        job_runner.submit(ran.append, "after-restart").result(timeout=5)
    finally:
        job_runner.stop()
    assert ran == ["after-restart"]


def test_fallback_backend_uses_process_wide_runner():
    executed: List[str] = []
    backend = BackgroundTaskQueueBackend(executed.append)

    backend.enqueue_delivery("job-1").result(timeout=5)

    assert executed == ["job-1"]
