"""Job progress monitoring utilities for WebSocket fan-out."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, Optional, Protocol, Tuple

import structlog

from backend.schemas import GenerationComplete, ProgressUpdate, SDNextGenerationResult
from backend.utils.images import to_browser_image_src

logger = structlog.get_logger(__name__)


class GenerationProgressClient(Protocol):
    """Protocol describing the subset of generation service APIs used."""

    async def check_progress(self, job_id: str) -> SDNextGenerationResult: ...

    async def check_generation_progress(
        self, job_id: str
    ) -> SDNextGenerationResult: ...


@dataclass
class PersistedJobState:
    """Persisted metadata about a delivery job."""

    status: Optional[str]
    result: Optional[Dict[str, Any]]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class JobStateRepository(Protocol):
    """Protocol for loading persisted job state."""

    def get_job_state(self, job_id: str) -> Optional[PersistedJobState]:
        """Return persisted state for ``job_id`` if available."""
        ...


ProgressCallback = Callable[[ProgressUpdate], Awaitable[None]]
CompletionCallback = Callable[[GenerationComplete], Awaitable[None]]

# (backend result, persisted state, status, progress, error message)
_Observation = Tuple[
    SDNextGenerationResult,
    Optional[PersistedJobState],
    str,
    Optional[float],
    Optional[str],
]


class JobProgressMonitor:
    """Poll generation backends and combine progress with persisted state.

    SD.Next's progress endpoint is process-global: it reports whatever SD.Next
    is rendering right now and ignores the job id it is asked about. Its value
    is therefore only meaningful for the job that is actually running. When a
    repository is configured, the persisted delivery job is authoritative:
    live progress is read only while that job's persisted status normalizes
    to ``processing``, queued jobs report their stored progress (or 0), and
    completion is decided from the persisted status alone. Without a
    repository the monitor trusts the generation backend's response.
    """

    def __init__(
        self,
        *,
        repository: Optional[JobStateRepository] = None,
        poll_interval: float = 2.0,
    ) -> None:
        """Configure the repository and polling interval."""
        self._repository = repository
        self._poll_interval = poll_interval
        self._tasks: Dict[str, asyncio.Task[None]] = {}

    async def start(
        self,
        job_id: str,
        generation_service: GenerationProgressClient,
        on_progress: ProgressCallback,
        on_complete: CompletionCallback,
    ) -> asyncio.Task[None]:
        """Begin monitoring a job, returning the created polling task."""
        if job_id in self._tasks:
            return self._tasks[job_id]

        task = asyncio.create_task(
            self._monitor_job(job_id, generation_service, on_progress, on_complete),
        )
        self._tasks[job_id] = task
        logger.info("Started job monitoring", job_id=job_id)
        return task

    def stop(self, job_id: str) -> None:
        """Cancel monitoring for a job if it is running."""
        task = self._tasks.pop(job_id, None)
        if task is None:
            return

        task.cancel()
        logger.info("Stopped job monitoring", job_id=job_id)

    async def _monitor_job(
        self,
        job_id: str,
        generation_service: GenerationProgressClient,
        on_progress: ProgressCallback,
        on_complete: CompletionCallback,
    ) -> None:
        try:
            while True:
                observation = await self._observe(job_id, generation_service)
                if observation is None:
                    await asyncio.sleep(self._poll_interval)
                    continue

                (
                    result,
                    persisted_state,
                    status_value,
                    progress_value,
                    error_message,
                ) = observation

                if progress_value is None:
                    progress_value = 0.0

                progress_update = ProgressUpdate(
                    job_id=job_id,
                    progress=progress_value,
                    status=status_value,
                    error_message=error_message,
                )
                await on_progress(progress_update)

                if self._has_job_completed(status_value, persisted_state):
                    completion_payload = self._build_completion_payload(
                        job_id,
                        status_value,
                        result,
                        persisted_state,
                        error_message,
                    )
                    await on_complete(completion_payload)
                    break

                await asyncio.sleep(self._poll_interval)
        except asyncio.CancelledError:
            logger.info("Job monitoring cancelled", job_id=job_id)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.error("Job monitoring error", job_id=job_id, error=str(exc))
        finally:
            self._tasks.pop(job_id, None)

    async def _observe(
        self,
        job_id: str,
        generation_service: GenerationProgressClient,
    ) -> Optional[_Observation]:
        """Poll once and return the state to broadcast for ``job_id``.

        Returns ``None`` when a repository is configured but the job's state
        could not be loaded; the caller skips that tick rather than report
        SD.Next's global progress, which may belong to another job.
        """
        if self._repository is None:
            result = await self._call_generation_progress(generation_service, job_id)
            return (
                result,
                None,
                _normalize_generation_status(result.status or "pending"),
                self._normalize_progress(result.progress),
                result.error_message,
            )

        persisted_state = self._safe_load_state(job_id)
        if persisted_state is None:
            logger.debug("No persisted state for monitored job", job_id=job_id)
            return None

        live_result: Optional[SDNextGenerationResult] = None
        stored_status = _normalize_generation_status(_stored_status(persisted_state))
        if stored_status == "processing":
            live_result = await self._call_generation_progress(
                generation_service, job_id
            )

        status_value, progress_value, error_message = self._merge_persisted_state(
            persisted_state, live_result
        )
        result = live_result or SDNextGenerationResult(
            job_id=job_id, status=status_value
        )
        return result, persisted_state, status_value, progress_value, error_message

    async def _call_generation_progress(
        self,
        generation_service: GenerationProgressClient,
        job_id: str,
    ) -> SDNextGenerationResult:
        if hasattr(generation_service, "check_progress"):
            return await generation_service.check_progress(job_id)

        if hasattr(generation_service, "check_generation_progress"):
            return await generation_service.check_generation_progress(job_id)

        raise AttributeError(
            "Generation service does not expose a progress check method",
        )

    def _safe_load_state(self, job_id: str) -> Optional[PersistedJobState]:
        if self._repository is None:
            return None

        try:
            return self._repository.get_job_state(job_id)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning(
                "Failed to load persisted job state",
                job_id=job_id,
                error=str(exc),
            )
            return None

    def _merge_persisted_state(
        self,
        persisted_state: PersistedJobState,
        live_result: Optional[SDNextGenerationResult],
    ) -> tuple[str, Optional[float], Optional[str]]:
        """Derive status, progress and error with persisted state in charge.

        ``live_result`` is supplied only while the persisted status is
        ``processing``. For any other status SD.Next's global progress belongs
        to a different job (or none) and is ignored.
        """
        result_payload = persisted_state.result
        status_value = _normalize_generation_status(_stored_status(persisted_state))

        progress_value = self._extract_progress_from_payload(result_payload)
        error_message: Optional[str] = None
        if live_result is not None:
            if progress_value is None:
                progress_value = self._normalize_progress(live_result.progress)
            error_message = live_result.error_message

        if status_value == "completed" and (
            progress_value is None or progress_value < 1.0
        ):
            progress_value = 1.0

        if error_message is None:
            error_message = self._extract_error_message(result_payload)

        return status_value, progress_value, error_message

    def _extract_progress_from_payload(
        self,
        payload: Optional[Dict[str, Any]],
    ) -> Optional[float]:
        if not isinstance(payload, dict):
            return None
        return self._normalize_progress(payload.get("progress"))

    @staticmethod
    def _extract_error_message(
        payload: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        if not isinstance(payload, dict):
            return None
        for key in ("error_message", "error", "detail", "message"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    @staticmethod
    def _normalize_progress(progress: Optional[Any]) -> Optional[float]:
        if progress is None:
            return None

        try:
            value = float(progress)
        except (TypeError, ValueError):
            return None

        if value > 1.0:
            value = value / 100.0
        if value < 0.0:
            value = 0.0
        return min(value, 1.0)

    def _has_job_completed(
        self,
        status: str,
        persisted_state: Optional[PersistedJobState],
    ) -> bool:
        if status in {"completed", "failed"}:
            return True

        if not persisted_state:
            return False

        stored_status = _stored_status(persisted_state)
        if not stored_status:
            return False

        normalized = _normalize_generation_status(stored_status)
        return normalized in {"completed", "failed"}

    def _build_completion_payload(
        self,
        job_id: str,
        status: str,
        progress_result: SDNextGenerationResult,
        persisted_state: Optional[PersistedJobState],
        error_message: Optional[str],
    ) -> GenerationComplete:
        images = progress_result.images
        generation_info = progress_result.generation_info
        payload: Optional[Dict[str, Any]] = None

        if persisted_state is not None:
            payload = persisted_state.result

        if (not images) and isinstance(payload, dict):
            stored_images = payload.get("images")
            if isinstance(stored_images, list) and stored_images:
                images = stored_images

        if generation_info is None and isinstance(payload, dict):
            stored_info = payload.get("generation_info")
            if isinstance(stored_info, dict) and stored_info:
                generation_info = stored_info

        final_error = error_message or progress_result.error_message
        if final_error is None and isinstance(payload, dict):
            final_error = self._extract_error_message(payload)

        total_duration: Optional[float] = None
        if persisted_state is not None:
            total_duration = self._calculate_total_duration(
                persisted_state.started_at,
                persisted_state.finished_at,
            )

        if images:
            # Clients render these directly, so send loadable sources only.
            sources = (
                to_browser_image_src(image, job_id=job_id, index=index)
                for index, image in enumerate(images)
                if isinstance(image, str)
            )
            images = [src for src in sources if src] or None
        else:
            images = None

        return GenerationComplete(
            job_id=job_id,
            status=status,
            images=images,
            error_message=final_error,
            total_duration=total_duration,
            generation_info=generation_info,
        )

    @staticmethod
    def _calculate_total_duration(
        started_at: Optional[datetime],
        finished_at: Optional[datetime],
    ) -> Optional[float]:
        if started_at is None or finished_at is None:
            return None
        try:
            return float((finished_at - started_at).total_seconds())
        except Exception:  # pragma: no cover - defensive branch
            return None


__all__ = [
    "CompletionCallback",
    "JobProgressMonitor",
    "JobStateRepository",
    "PersistedJobState",
    "ProgressCallback",
]


def _normalize_generation_status(status: Optional[str]) -> str:
    from backend.services.generation.statuses import normalize_status

    return normalize_status(status).value


def _stored_status(persisted_state: PersistedJobState) -> Optional[str]:
    """Return the persisted status, falling back to the result payload's."""
    if persisted_state.status:
        return persisted_state.status
    payload = persisted_state.result
    if isinstance(payload, dict):
        value = payload.get("status")
        if isinstance(value, str) and value:
            return value
    return None
