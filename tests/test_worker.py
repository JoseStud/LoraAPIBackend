"""Worker tests using fakeredis and a SimpleWorker for synchronous processing.

These tests are skipped if `fakeredis` is not installed in the environment.
They run the real RQ retry loop: jobs are enqueued through the queue
orchestrator with the Redis backend's retry policy and executed by
``backend.workers.tasks.process_delivery``.
"""

import asyncio
from datetime import timedelta
from typing import Iterator, List, Optional

import pytest

fakeredis = pytest.importorskip("fakeredis")
from rq import Queue, SimpleWorker  # noqa: E402
from rq.job import JobStatus  # noqa: E402
from rq.timeouts import JobTimeoutException  # noqa: E402

from backend.core.database import get_session_context  # noqa: E402
from backend.delivery.base import TransientGenerationError  # noqa: E402
from backend.models.deliveries import DeliveryJob  # noqa: E402
from backend.schemas import DeliveryJobResult  # noqa: E402
from backend.services.job_recovery import recover_jobs  # noqa: E402
from backend.services.queue import (  # noqa: E402
    QueueOrchestrator,
    RedisQueueBackend,
    rq_job_id,
)
from backend.workers import tasks as worker_tasks  # noqa: E402
from backend.workers.context import WorkerContext  # noqa: E402
from backend.workers.tasks import reset_worker_context, set_worker_context  # noqa: E402


class Harness:
    """A worker context wired to a fake Redis queue and a scripted backend."""

    def __init__(self, context: WorkerContext, queue: Queue, redis) -> None:
        self.context = context
        self.queue = queue
        self.redis = redis
        # One entry per backend call: an exception to raise, or None to succeed.
        self.script: List[Optional[BaseException]] = []
        self.calls: List[Optional[int]] = []
        self.statuses: List[str] = []
        # The stored result each attempt starts from (after its claim).
        self.results_at_start: List[Optional[str]] = []

    def create_job(self) -> str:
        with get_session_context() as sess:
            return (
                self.context
                .create_service_container(sess)
                .deliveries.create_job("hello", "cli", {"template": "t"})
                .id
            )

    def enqueue(self, job_id: str, **kwargs):
        with get_session_context() as sess:
            services = self.context.create_service_container(sess)
            return services.deliveries.queue_orchestrator.enqueue_delivery(
                job_id, **kwargs
            )

    def status(self, job_id: str) -> str:
        return self.row(job_id).status

    def row(self, job_id: str) -> DeliveryJob:
        with get_session_context() as sess:
            job = sess.get(DeliveryJob, job_id)
            assert job is not None
            sess.expunge(job)
            return job

    def result(self, job_id: str) -> Optional[DeliveryJobResult]:
        return DeliveryJobResult.parse_json(self.row(job_id).result)

    def recover(self, *, at_startup: bool):
        with get_session_context() as sess:
            deliveries = self.context.create_service_container(sess).deliveries
            return recover_jobs(
                deliveries, at_startup=at_startup, running_timeout=timedelta(hours=1)
            )

    def cancel(self, job_id: str) -> Optional[str]:
        with get_session_context() as sess:
            return self.context.create_service_container(sess).deliveries.cancel_job(
                job_id
            )

    def work(self, **kwargs) -> None:
        SimpleWorker([self.queue], connection=self.redis).work(burst=True, **kwargs)


@pytest.fixture
def harness(db_session, monkeypatch) -> Iterator[Harness]:
    """Build a worker context whose Redis backend retries twice, immediately.

    Retry intervals of 0 requeue the job at once, so a burst worker runs every
    attempt without RQ's scheduler. ``db_session`` swaps the engine for an
    in-memory database, so jobs don't land in the real db.sqlite.
    """
    fake_redis = fakeredis.FakeStrictRedis()
    queue = Queue("default", connection=fake_redis)
    backend = RedisQueueBackend(
        "redis://localhost:6379/0", max_retries=2, retry_intervals=[0]
    )
    monkeypatch.setattr(backend, "_queue", queue, raising=False)
    orchestrator = QueueOrchestrator(primary_backend=backend)
    context = WorkerContext(
        queue_orchestrator=orchestrator, recommendation_gpu_available=False
    )
    h = Harness(context, queue, fake_redis)
    runner = context.delivery_runner
    original_process = runner._process_delivery_job_async

    async def process(job_id, *, retries_left=None, raise_on_error=False):
        # Record the status each attempt leaves behind, even when it raises.
        try:
            await original_process(
                job_id, retries_left=retries_left, raise_on_error=raise_on_error
            )
        finally:
            h.statuses.append(h.status(job_id))

    async def execute(prompt, mode, params):
        h.calls.append(_current_retries_left())
        h.results_at_start.append(h.row(_current_delivery_id()).result)
        outcome = h.script.pop(0) if h.script else None
        if outcome is not None:
            raise outcome
        return {"status": "ok"}

    monkeypatch.setattr(runner, "_process_delivery_job_async", process)
    monkeypatch.setattr(runner, "_execute_delivery_backend", execute)
    reset_worker_context()
    set_worker_context(context)
    try:
        yield h
    finally:
        reset_worker_context()


def _current_retries_left() -> Optional[int]:
    from rq import get_current_job

    return getattr(get_current_job(), "retries_left", None)


def _current_delivery_id() -> str:
    from rq import get_current_job

    return get_current_job().args[0]


def test_worker_process_cycle(harness):
    """Run a full enqueue -> worker cycle using a FakeRedis connection."""
    job_id = harness.create_job()
    rq_job = harness.enqueue(job_id)

    harness.work()

    assert harness.status(job_id) == "succeeded"
    assert harness.calls == [2]
    assert rq_job.get_status(refresh=True) == JobStatus.FINISHED


def test_rq_retries_job_that_raised(harness):
    """An exception with retries left leaves the job retrying; RQ runs it again."""
    harness.script = [ConnectionError("sdnext unreachable")]
    job_id = harness.create_job()
    rq_job = harness.enqueue(job_id)

    harness.work()

    # RQ decrements retries_left only when it schedules the retry, so each
    # attempt sees how many more attempts follow it.
    assert harness.calls == [2, 1]
    assert harness.statuses == ["retrying", "succeeded"]
    assert rq_job.get_status(refresh=True) == JobStatus.FINISHED


def test_last_attempt_fails_job(harness):
    """When every attempt raises, the last one marks the job failed."""
    harness.script = [ConnectionError("down")] * 3
    job_id = harness.create_job()
    rq_job = harness.enqueue(job_id)

    harness.work()

    assert harness.calls == [2, 1, 0]
    assert harness.statuses == ["retrying", "retrying", "failed"]
    assert rq_job.get_status(refresh=True) == JobStatus.FAILED


def test_transient_generation_error_is_retried_with_its_message(harness):
    """SDNext being down is retried; each retry starts without the old error."""
    harness.script = [TransientGenerationError("SDNext API not available")] * 3
    job_id = harness.create_job()
    rq_job = harness.enqueue(job_id)

    harness.work()

    assert harness.calls == [2, 1, 0]
    assert harness.statuses == ["retrying", "retrying", "failed"]
    assert harness.results_at_start == [None, None, None]
    result = harness.result(job_id)
    assert result.error_message == "SDNext API not available"
    assert result.retries_left is None
    assert rq_job.get_status(refresh=True) == JobStatus.FAILED


def test_transient_error_then_success(harness):
    harness.script = [TransientGenerationError("SDNext request timed out")]
    job_id = harness.create_job()
    harness.enqueue(job_id)

    harness.work()

    assert harness.statuses == ["retrying", "succeeded"]
    assert harness.result(job_id).failure_message is None


def test_cancelled_retrying_job_is_not_resurrected(harness):
    """A job cancelled while it waits for its retry stays cancelled."""
    harness.script = [ConnectionError("down")]
    job_id = harness.create_job()
    rq_job = harness.enqueue(job_id)

    harness.work(max_jobs=1)
    assert harness.status(job_id) == "retrying"
    assert harness.cancel(job_id) == "retrying"

    harness.work()

    assert harness.calls == [2], "the retry must not run the backend again"
    assert harness.status(job_id) == "cancelled"
    assert rq_job.get_status(refresh=True) == JobStatus.FINISHED


def test_timeout_inside_job_fails_without_retry(harness):
    """RQ's job timeout is final even with retries left."""
    harness.script = [JobTimeoutException("Task exceeded maximum timeout value")]
    job_id = harness.create_job()

    harness.enqueue(job_id)
    harness.work()

    # RQ still retries the task, but the job is failed and cannot be claimed.
    assert harness.calls == [2]
    assert harness.statuses == ["failed", "failed"]


def test_retry_after_killed_attempt_leaves_job_to_recovery(harness):
    """A killed attempt leaves the job running; its retry skips it.

    When RQ's timeout kills the work horse (or interrupts the event loop) the
    runner never records an outcome. The retry cannot claim a running job, so
    the work never runs twice; job recovery fails it once it has been running
    for longer than the timeout.
    """
    job_id = harness.create_job()
    with get_session_context() as sess:
        services = harness.context.create_service_container(sess)
        assert services.deliveries.claim_job(job_id) is not None

    harness.enqueue(job_id)
    harness.work()

    assert harness.calls == []
    assert harness.status(job_id) == "running"

    with get_session_context() as sess:
        deliveries = harness.context.create_service_container(sess).deliveries
        report = recover_jobs(
            deliveries, at_startup=False, running_timeout=timedelta(0)
        )
    assert [job.job_id for job in report.failed] == [job_id]
    assert harness.status(job_id) == "failed"


def test_rq_job_id_is_deterministic_across_retries(harness):
    harness.script = [ConnectionError("down")]
    job_id = harness.create_job()

    rq_job = harness.enqueue(job_id)
    assert rq_job.id == rq_job_id(job_id)
    harness.work()

    assert harness.statuses == ["retrying", "succeeded"]
    assert harness.queue.fetch_job(rq_job_id(job_id)) is not None


def test_has_pending_follows_the_rq_job(harness):
    backend = harness.context.queue_orchestrator.get_backends()[0]
    job_id = harness.create_job()
    assert backend.has_pending(job_id) is False

    harness.enqueue(job_id)
    assert backend.has_pending(job_id) is True
    assert harness.context.queue_orchestrator.has_pending(job_id) is True

    harness.work()
    assert backend.has_pending(job_id) is False


def test_recovery_requeues_jobs_lost_with_a_flushed_redis(harness):
    """Redis restarted empty: recovery queues the waiting job again, once."""
    job_id = harness.create_job()
    harness.enqueue(job_id)
    harness.redis.flushall()

    report = harness.recover(at_startup=True)

    assert report.requeued == [job_id]
    again = harness.recover(at_startup=True)
    assert again.requeued == [], "the requeued job is pending in Redis"
    assert harness.queue.count == 1

    harness.work()
    assert harness.status(job_id) == "succeeded"
    assert harness.calls == [2]


def test_recovery_leaves_queued_jobs_alone(harness):
    job_id = harness.create_job()
    harness.enqueue(job_id)

    report = harness.recover(at_startup=True)

    assert report.requeued == []
    assert harness.queue.count == 1


def test_rq_timeout_while_awaiting_io_fails_job_as_timed_out(harness, monkeypatch):
    """RQ's SIGALRM fires while the event loop waits on the backend.

    The runner's deadline is far away, so RQ's backstop fires first; the
    job is still failed as timed out and RQ's retry does not run it again.
    """
    runner = harness.context.delivery_runner
    calls: List[str] = []

    async def hang(prompt, mode, params):
        calls.append(prompt)
        await asyncio.sleep(30)

    monkeypatch.setattr(runner, "_execute_delivery_backend", hang)
    job_id = harness.create_job()
    rq_job = harness.enqueue(job_id, job_timeout=1)

    harness.work()

    assert calls == ["hello"]
    # The first entry is recorded while asyncio.run cancels the interrupted
    # attempt, before the backstop fails the job; the second is RQ's retry,
    # which cannot claim the failed job.
    assert harness.statuses == ["running", "failed"]
    assert harness.status(job_id) == "failed"
    assert harness.result(job_id).error_message == "Delivery timed out"
    rq_job.refresh()
    assert rq_job.retries_left == 1, "RQ retried the task, which skipped the job"


def test_retry_waits_for_interval(db_session, monkeypatch):
    """Retry intervals schedule the next attempt instead of requeueing it."""
    fake_redis = fakeredis.FakeStrictRedis()
    queue = Queue("default", connection=fake_redis)
    backend = RedisQueueBackend(
        "redis://localhost:6379/0", max_retries=2, retry_intervals=[10, 20]
    )
    monkeypatch.setattr(backend, "_queue", queue, raising=False)
    context = WorkerContext(
        queue_orchestrator=QueueOrchestrator(primary_backend=backend),
        recommendation_gpu_available=False,
    )

    async def execute(prompt, mode, params):
        raise ConnectionError("down")

    monkeypatch.setattr(context.delivery_runner, "_execute_delivery_backend", execute)
    set_worker_context(context)
    try:
        with get_session_context() as sess:
            deliveries = context.create_service_container(sess).deliveries
            job_id = deliveries.create_job("hello", "cli", {}).id
            rq_job = deliveries.queue_orchestrator.enqueue_delivery(job_id)

        assert rq_job.retries_left == 2
        assert rq_job.retry_intervals == [10, 20]

        SimpleWorker([queue], connection=fake_redis).work(burst=True)

        rq_job.refresh()
        assert rq_job.get_status() == JobStatus.SCHEDULED
        assert rq_job.retries_left == 1
        assert rq_job.id in queue.scheduled_job_registry.get_job_ids()
        with get_session_context() as sess:
            assert sess.get(DeliveryJob, job_id).status == "retrying"
    finally:
        worker_tasks.reset_worker_context()
