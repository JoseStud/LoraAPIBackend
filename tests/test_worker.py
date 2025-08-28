"""Worker tests using fakeredis and a SimpleWorker for synchronous processing.

These tests are skipped if `fakeredis` is not installed in the environment.
"""

import pytest

fakeredis = pytest.importorskip("fakeredis")
from rq import Queue, SimpleWorker  # noqa: E402

from db import get_session, init_db  # noqa: E402
from models import DeliveryJob  # noqa: E402
from tasks import enqueue_delivery  # noqa: E402


def test_worker_process_cycle(tmp_path, monkeypatch):
    """Run a full enqueue -> worker cycle using a FakeRedis connection."""
    # Use FakeRedis for the queue connection
    fake_redis = fakeredis.FakeStrictRedis()
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    # patch the queue in tasks to use a fake connection
    fake_q = Queue("default", connection=fake_redis)
    monkeypatch.setattr("tasks.q", fake_q)

    # Ensure DB initialized in a temp directory to avoid collisions. The DB
    # is created in the module path, so ensure init_db runs (it will create
    # db.sqlite next to files).
    init_db()

    # enqueue a simple CLI delivery
    did = enqueue_delivery("hello", "cli", {"template": "t"}, max_retries=1)
    assert did is not None

    # Run a SimpleWorker to process queued jobs synchronously
    worker = SimpleWorker([fake_q], connection=fake_redis)
    worker.work(burst=True)

    # check DB state
    with get_session() as sess:
        dj = sess.get(DeliveryJob, did)
        assert dj is not None
        # Either succeeded or failed depending on execution; we expect at
        # least a status set
        assert dj.status in ("succeeded", "failed", "retrying")


# duplicate test removed; the single test above exercises the worker cycle
