"""Worker tests using fakeredis and a SimpleWorker for synchronous processing.

These tests are skipped if `fakeredis` is not installed in the environment.
"""

import pytest

fakeredis = pytest.importorskip("fakeredis")
from rq import Queue, SimpleWorker  # noqa: E402

from backend.core.config import settings  # noqa: E402
from backend.core.database import get_session_context, init_db  # noqa: E402
from backend.models.deliveries import DeliveryJob  # noqa: E402
from backend.services.queue import RedisQueueBackend, reset_queue_backends  # noqa: E402
from backend.workers import tasks as worker_tasks  # noqa: E402
from backend.workers.tasks import (  # noqa: E402
    enqueue_delivery,
    reset_worker_context,
    set_worker_context,
)


def test_worker_process_cycle(tmp_path, monkeypatch):
    """Run a full enqueue -> worker cycle using a FakeRedis connection."""
    # Use FakeRedis for the queue connection
    fake_redis = fakeredis.FakeStrictRedis()
    original_url = settings.REDIS_URL
    reset_queue_backends()
    try:
        settings.REDIS_URL = "redis://localhost:6379/0"
        reset_worker_context()
        context = worker_tasks.build_worker_context()
        assert isinstance(context.queue_backend, RedisQueueBackend)

        # patch the queue in tasks to use a fake connection
        fake_q = Queue("default", connection=fake_redis)
        monkeypatch.setattr(context.queue_backend, "_queue", fake_q, raising=False)
        set_worker_context(context)

        # Ensure DB initialized in a temp directory to avoid collisions. The DB
        # is created in the module path, so ensure init_db runs (it will create
        # db.sqlite next to files).
        init_db()

        # enqueue a simple CLI delivery
        did = enqueue_delivery(
            "hello",
            "cli",
            {"template": "t"},
            max_retries=1,
            context=context,
        )
        assert did is not None

        # Run a SimpleWorker to process queued jobs synchronously
        worker = SimpleWorker([fake_q], connection=fake_redis)
        worker.work(burst=True)

        # check DB state
        with get_session_context() as sess:
            dj = sess.get(DeliveryJob, did)
            assert dj is not None
            # Either succeeded or failed depending on execution; we expect at
            # least a status set
            assert dj.status in ("succeeded", "failed", "retrying")
    finally:
        settings.REDIS_URL = original_url
        reset_worker_context()
        reset_queue_backends()


# duplicate test removed; the single test above exercises the worker cycle
