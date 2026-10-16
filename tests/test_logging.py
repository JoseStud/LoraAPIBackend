"""Backend modules share one structlog-over-stdlib logging setup."""

from __future__ import annotations

import json
import logging

import pytest

from backend.core.logging import get_logger
from backend.workers import context as worker_context
from backend.workers import tasks as worker_tasks


def _events(caplog: pytest.LogCaptureFixture, name: str) -> list[dict]:
    return [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == name
    ]


def test_positional_and_keyword_styles_render_through_stdlib(caplog):
    logger = get_logger("tests.logging.styles")

    with caplog.at_level(logging.INFO, logger="tests.logging.styles"):
        logger.info("Delivery %s skipped: status is %s", "job-1", "cancelled")
        logger.info("Delivery skipped", job_id="job-2", status="failed")
        logger.debug("Below the level, dropped %s", "quietly")

    first, second = _events(caplog, "tests.logging.styles")
    assert first["event"] == "Delivery job-1 skipped: status is cancelled"
    assert "positional_args" not in first
    assert second["event"] == "Delivery skipped"
    assert (second["job_id"], second["status"]) == ("job-2", "failed")
    assert {first["level"], second["level"]} == {"info"}
    assert first["logger"] == "tests.logging.styles"


def test_exceptions_are_rendered_into_the_event(caplog):
    logger = get_logger("tests.logging.errors")

    with caplog.at_level(logging.ERROR, logger="tests.logging.errors"):
        try:
            raise RuntimeError("boom")
        except RuntimeError:
            logger.exception("Job %s failed", "job-3")

    (event,) = _events(caplog, "tests.logging.errors")
    assert event["event"] == "Job job-3 failed"
    assert "RuntimeError: boom" in event["exception"]


def test_worker_tasks_log_fields_without_their_own_handler(caplog):
    assert logging.getLogger(worker_tasks.__name__).handlers == []

    with caplog.at_level(logging.WARNING, logger=worker_tasks.__name__):
        worker_tasks.logger.warning("Delivery task found no job", delivery_id="d-1")

    (event,) = _events(caplog, worker_tasks.__name__)
    assert event == {
        **event,
        "event": "Delivery task found no job",
        "delivery_id": "d-1",
        "level": "warning",
    }


def test_worker_context_sets_up_logging(monkeypatch):
    """RQ workers run no lifespan, so building their context sets up logging
    and keeps RQ's own handlers from printing its lines a second time."""
    calls: list[str] = []
    monkeypatch.setattr(worker_context, "setup_logging", lambda: calls.append("x"))
    monkeypatch.setattr(worker_context, "ensure_delivery_system", lambda: None)
    rq_logger = logging.getLogger("rq.worker")
    handler = logging.NullHandler()
    monkeypatch.setattr(rq_logger, "handlers", [handler])
    monkeypatch.setattr(rq_logger, "propagate", True)

    worker_context.WorkerContext.build_default(recommendation_gpu_available=False)

    assert calls == ["x"]
    assert rq_logger.propagate is False
