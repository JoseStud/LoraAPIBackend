"""Test helpers for the in-process delivery job runner."""

from __future__ import annotations

import asyncio
import threading
from typing import Optional

from backend.services.in_process_jobs import (
    InProcessJobRunner,
    get_in_process_job_runner,
)


def drain_in_process_jobs(
    runner: Optional[InProcessJobRunner] = None, *, timeout: float = 5.0
) -> None:
    """Wait until every job queued on ``runner`` so far has run.

    Jobs run in order, so a no-op job finishing means the earlier ones have.
    """
    runner = runner or get_in_process_job_runner()
    runner.submit(lambda _job_id: None, "drain").result(timeout=timeout)


class InProcessJobGate:
    """Keep jobs queued on the runner from starting until the test runs them.

    API tests share one in-memory SQLite connection between the request
    thread and the job runner's thread, so a job must not touch the database
    while a request still does. Stopping the runner cancels the gate.
    """

    def __init__(self, runner: Optional[InProcessJobRunner] = None) -> None:
        self._runner = runner or get_in_process_job_runner()
        self._open = threading.Event()
        self._runner.submit(self._wait, "gate")

    async def _wait(self, _job_id: str) -> None:
        while not self._open.is_set():
            await asyncio.sleep(0.005)

    def run_queued_jobs(self, *, timeout: float = 5.0) -> None:
        """Open the gate and wait for the jobs queued so far to finish."""
        self._open.set()
        drain_in_process_jobs(self._runner, timeout=timeout)
