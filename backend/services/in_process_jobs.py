"""Serial in-process execution of delivery jobs.

Without Redis the API process runs delivery jobs itself. SDNext renders one
image at a time and its progress and interrupt endpoints are global, so jobs
must never overlap: they run one at a time, in the order they were queued, on
a dedicated thread that owns one long-lived event loop. Because the loop
outlives each job, HTTP sessions bound to it stay usable from job to job.

The runner is process-wide (:func:`get_in_process_job_runner`) so that request
handlers and job recovery share one queue. Its thread starts with the first
job; the application lifespan stops it on shutdown.
"""

from __future__ import annotations

import asyncio
import inspect
import threading
from concurrent.futures import CancelledError, Future
from typing import Any, Callable, Optional, Tuple

from backend.core.logging import get_logger

logger = get_logger(__name__)

JobFunc = Callable[[str], Any]
_QueuedJob = Tuple[JobFunc, str, "Future[None]"]


class _JobThread:
    """One worker thread, its event loop and the jobs waiting on it."""

    def __init__(self, name: str) -> None:
        self.loop = asyncio.new_event_loop()
        self.jobs: asyncio.Queue[_QueuedJob] = asyncio.Queue()
        # Created before the loop runs so stop() always has a task to cancel.
        self._consumer = self.loop.create_task(self._consume())
        self._thread = threading.Thread(target=self._serve, name=name, daemon=True)
        self._thread.start()

    def put(self, item: _QueuedJob) -> None:
        """Queue ``item`` from any thread."""
        self.loop.call_soon_threadsafe(self.jobs.put_nowait, item)

    def stop(self, timeout: float) -> None:
        """Cancel the running job, drop queued ones and wait for the thread."""
        try:
            self.loop.call_soon_threadsafe(self._consumer.cancel)
        except RuntimeError:  # pragma: no cover - loop already closed
            pass
        if threading.current_thread() is not self._thread:
            self._thread.join(timeout)

    async def _consume(self) -> None:
        while True:
            func, job_id, future = await self.jobs.get()
            if not future.set_running_or_notify_cancel():
                continue
            try:
                result = func(job_id)
                if inspect.isawaitable(result):
                    await result
            except asyncio.CancelledError:
                future.set_exception(CancelledError())
                if self._consumer.cancelling():
                    raise
                # Only the job was cancelled; the runner carries on.
                logger.info("In-process delivery job %s was cancelled", job_id)
            except Exception as exc:
                logger.exception("In-process delivery job %s failed", job_id)
                future.set_exception(exc)
            else:
                future.set_result(None)

    def _serve(self) -> None:
        loop = self.loop
        try:
            try:
                loop.run_until_complete(self._consumer)
            except asyncio.CancelledError:
                pass
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(
                    asyncio.gather(*pending, return_exceptions=True)
                )
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        except Exception:  # pragma: no cover - defensive guard
            logger.exception("In-process job runner stopped with an error")
        finally:
            while not self.jobs.empty():
                _, _, future = self.jobs.get_nowait()
                future.cancel()
            loop.close()


class InProcessJobRunner:
    """Run queued delivery jobs one at a time on a dedicated thread."""

    def __init__(self, *, thread_name: str = "delivery-jobs") -> None:
        """Create the runner; its thread starts with the first job."""
        self._thread_name = thread_name
        self._lock = threading.Lock()
        self._thread: Optional[_JobThread] = None

    def submit(self, func: JobFunc, job_id: str) -> "Future[None]":
        """Queue ``func(job_id)`` behind the jobs already queued.

        ``func`` runs on the runner's event loop; an awaitable it returns is
        awaited before the next job starts. The returned future completes
        when the job does, and is cancelled if the runner stops first.
        """
        future: Future[None] = Future()
        with self._lock:
            if self._thread is None:
                self._thread = _JobThread(self._thread_name)
            self._thread.put((func, job_id, future))
        return future

    def stop(self, timeout: float = 5.0) -> None:
        """Stop the thread, cancelling the running job and dropping queued ones.

        A cancelled job keeps its ``running`` status until job recovery fails
        it; jobs that never started are requeued by recovery at the next
        start. A later :meth:`submit` starts a new thread.
        """
        with self._lock:
            thread, self._thread = self._thread, None
        if thread is not None:
            thread.stop(timeout)


_runner = InProcessJobRunner()


def get_in_process_job_runner() -> InProcessJobRunner:
    """Return the process-wide in-process job runner."""
    return _runner


__all__ = ["InProcessJobRunner", "get_in_process_job_runner"]
