"""Worker tests using fakeredis and a SimpleWorker for synchronous processing.

These tests are skipped if `fakeredis` is not installed in the environment.
They run the real RQ retry loop: jobs are enqueued through the queue
orchestrator with the Redis backend's retry policy and executed by
``backend.workers.tasks.process_delivery``.
"""

from datetime import timedelta
from typing import Iterator, List, Optional

import pytest

fakeredis = pytest.importorskip("fakeredis")
from rq import Queue, SimpleWorker  # noqa: E402
from rq.job import JobStatus  # noqa: E402
from rq.timeouts import JobTimeoutException  # noqa: E402

from backend.core.database import get_session_context  # noqa: E402
from backend.models.deliveries import DeliveryJob  # noqa: E402
from backend.services.job_recovery import recover_jobs  # noqa: E402
from backend.services.queue import QueueOrchestrator, RedisQueueBackend  # noqa: E402
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
        with get_session_context() as sess:
            job = sess.get(DeliveryJob, job_id)
            assert job is not None
            return job.status

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
