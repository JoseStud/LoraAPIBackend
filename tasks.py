"""Background worker helpers for enqueueing and processing deliveries.

This module integrates with RQ (Redis Queue) and updates DeliveryJob
records in the database as the worker processes jobs.
"""

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from redis import Redis
from rq import Queue, get_current_job

try:
    from rq.retry import Retry
except Exception:
    try:
        from rq import Retry  # type: ignore
    except Exception:
        @dataclass
        class Retry:  # type: ignore
            """Fallback Retry dataclass used when RQ's Retry is unavailable."""

            max: int = 0
            interval: list | None = None

from db import get_session
from models import DeliveryJob
from services import create_delivery_job, deliver_cli, deliver_http

# Basic structured-ish logger for worker events
logger = logging.getLogger("lora.tasks")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    h.setFormatter(fmt)
    logger.addHandler(h)
logger.setLevel(logging.INFO)

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_conn = Redis.from_url(redis_url)
q = Queue("default", connection=redis_conn)


def enqueue_delivery(prompt: str, mode: str, params: dict, max_retries: int = 3):
    """Create a DeliveryJob and enqueue it with exponential backoff retry intervals.

    max_retries is the number of retry attempts (not counting the first try).
    """
    dj = create_delivery_job(prompt, mode, params)
    intervals = [2 ** i for i in range(max_retries)] if max_retries > 0 else []
    retry = Retry(max=max_retries, interval=intervals) if max_retries > 0 else None
    job = q.enqueue(process_delivery, dj.id, retry=retry)
    logger.info(
        json.dumps(
            {
                "event": "enqueued",
                "delivery_id": dj.id,
                "job_id": job.id,
                "retries": max_retries,
                "intervals": intervals,
            },
        ),
    )
    return dj.id


def process_delivery(delivery_id: str):
    """Worker entrypoint.

    Updates the DeliveryJob status/result. Exceptions are re-raised so RQ
    can perform retries according to the configured policy.
    """
    logger.info(json.dumps({"event": "start", "delivery_id": delivery_id}))
    with get_session() as sess:
        dj = sess.get(DeliveryJob, delivery_id)
        if not dj:
            logger.warning(json.dumps({"event": "missing", "delivery_id": delivery_id}))
            return
        dj.status = "running"
        dj.started_at = datetime.now(timezone.utc)
        sess.add(dj)
        sess.commit()

    try:
        params = json.loads(dj.params) if dj.params else {}
    except Exception:
        params = {}

    try:
        if dj.mode == "http":
            @dataclass
            class H:
                """HTTP delivery parameter holder."""

                host: str | None = None
                port: int | None = None
                path: str | None = None

            hp = H(
                host=params.get("host"),
                port=params.get("port"),
                path=params.get("path"),
            )
            result = deliver_http(dj.prompt, hp)
        elif dj.mode == "cli":
            @dataclass
            class C:
                """CLI delivery parameter holder."""

                template: str | None = None

            cp = C(template=params.get("template"))
            result = deliver_cli(dj.prompt, cp)
        else:
            result = {"status": "error", "detail": "unknown mode"}

        with get_session() as sess:
            dj = sess.get(DeliveryJob, delivery_id)
            dj.status = "succeeded"
            dj.result = json.dumps(result)
            dj.finished_at = datetime.now(timezone.utc)
            sess.add(dj)
            sess.commit()

        logger.info(json.dumps({"event": "succeeded", "delivery_id": delivery_id}))
    except Exception as exc:
        # Check RQ job for remaining retries if available
        try:
            job = get_current_job()
            retries_left = getattr(job, "retries_left", None)
        except Exception:
            retries_left = None

        with get_session() as sess:
            dj = sess.get(DeliveryJob, delivery_id)
            if retries_left is None:
                dj.status = "failed"
                dj.result = json.dumps({"error": str(exc)})
                dj.finished_at = datetime.now(timezone.utc)
            elif retries_left <= 0:
                dj.status = "failed"
                dj.result = json.dumps(
                    {"error": str(exc), "retries_left": retries_left},
                )
                dj.finished_at = datetime.now(timezone.utc)
            else:
                dj.status = "retrying"
                dj.result = json.dumps(
                    {"last_error": str(exc), "retries_left": retries_left},
                )
            sess.add(dj)
            sess.commit()

        logger.error(
            json.dumps(
                {
                    "event": "error",
                    "delivery_id": delivery_id,
                    "error": str(exc),
                    "retries_left": retries_left,
                },
            ),
        )
        raise


if __name__ == "__main__":
    print("Queue ready. Use rq worker --url $REDIS_URL default to run workers.")
