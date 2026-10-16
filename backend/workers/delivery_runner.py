"""Delivery job runner that orchestrates backend execution."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, Callable, Dict, Optional, Set, Tuple

from sqlmodel import Session

from backend.core.config import settings
from backend.core.database import get_session_context
from backend.core.logging import get_logger
from backend.delivery import run_with_fresh_loop
from backend.delivery.base import (
    DeliveryRegistry,
    GenerationBackend,
    TransientGenerationError,
)
from backend.delivery.storage import remove_stored_images, stored_return_format
from backend.schemas import (
    DeliveryJobParams,
    DeliveryJobResult,
    SDNextGenerationParams,
)
from backend.services.job_webhooks import NOTIFY_STATUSES, JobWebhookNotifier

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from backend.services.deliveries import DeliveryService

_SUCCESS_STATUSES = {"ok", "completed", 200}
logger = get_logger(__name__)

PROCESSING_FAILED_MESSAGE = "Delivery processing failed"
"""Stored for an unexpected runner error; its text is only logged."""

TIMED_OUT_RESULT = DeliveryJobResult(error_message="Delivery timed out")
"""Stored for a job that hit its deadline (or RQ's job timeout)."""

INTERRUPT_TIMEOUT_SECONDS = 10.0
"""How long the runner waits for the backend's interrupt after a timeout."""

DeliveryServiceFactory = Callable[[Session], "DeliveryService"]


def _container_delivery_service(session: Session) -> DeliveryService:
    """Build the delivery service through the shared service container.

    Imported lazily: ``backend.services`` imports the queue module, which in
    turn imports this one.
    """
    from backend.services import get_service_container_builder

    return get_service_container_builder().build(session).deliveries


def _is_job_timeout(exc: BaseException) -> bool:
    """Return whether ``exc`` is RQ's job timeout firing inside the job."""
    try:
        from rq.timeouts import JobTimeoutException
    except ModuleNotFoundError:  # pragma: no cover - optional dependency
        return False
    return isinstance(exc, JobTimeoutException)


class DeliveryRunner:
    """Coordinate delivery job execution using registered backends."""

    def __init__(
        self,
        delivery_registry: DeliveryRegistry,
        *,
        webhook_notifier: Optional[JobWebhookNotifier] = None,
        delivery_service_factory: Optional[DeliveryServiceFactory] = None,
        deadline_seconds: Optional[float] = None,
    ) -> None:
        """Store the registry, the delivery service factory and a webhook notifier.

        ``delivery_service_factory`` builds the :class:`DeliveryService` used to
        read and update job state for a given session; by default it goes
        through the shared service container. Without an explicit notifier,
        one is built from settings per job, so a missing ``JOB_WEBHOOK_URL``
        simply disables the webhook. ``deadline_seconds`` is how long one
        attempt may run; by default ``settings.job_deadline_seconds``, which
        expires before RQ's job timeout.
        """
        self._delivery_registry = delivery_registry
        self._webhook_notifier = webhook_notifier
        self._delivery_service_factory = (
            delivery_service_factory or _container_delivery_service
        )
        self._deadline_seconds = deadline_seconds
        # Tasks scheduled on an already running loop; held so they are not
        # garbage collected before they finish.
        self._pending_tasks: Set[asyncio.Task[None]] = set()

    def process_delivery_job(
        self,
        job_id: str,
        retries_left: Optional[int] = None,
        *,
        raise_on_error: bool = False,
    ) -> Optional[asyncio.Task[None]]:
        """Process a delivery job.

        Without a running event loop (an RQ worker) the job runs to completion
        before this returns. On a running loop (the in-process job runner) it
        is scheduled as a task, which is returned.

        RQ's job timeout is a SIGALRM-raised ``JobTimeoutException``. The
        runner's own deadline normally expires first; if RQ's backstop fires
        anyway while the loop waits on I/O, the exception escapes the loop
        and the coroutine is cancelled without recording anything. The job
        is then failed as timed out (and the backend interrupted) here before
        the exception is re-raised to RQ.
        """

        async def runner() -> None:
            await self._process_delivery_job_async(
                job_id,
                retries_left=retries_left,
                raise_on_error=raise_on_error,
            )

        try:
            loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is None:
            try:
                # A loop per job: close the sessions it opened before it ends.
                run_with_fresh_loop(runner(), registry=self._delivery_registry)
            except BaseException as exc:
                if _is_job_timeout(exc):
                    self._record_backstop_timeout(job_id)
                raise
            return None

        if raise_on_error:
            raise RuntimeError(
                "Cannot raise errors when scheduling delivery processing on an"
                " active event loop",
            )
        task = loop.create_task(runner())
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)
        return task

    async def _process_delivery_job_async(
        self,
        job_id: str,
        *,
        retries_left: Optional[int] = None,
        raise_on_error: bool = False,
    ) -> None:
        """Load delivery state and execute the selected backend.

        ``retries_left`` is how many more attempts the queue makes if this one
        raises (RQ's ``Job.retries_left``, which RQ decrements only when it
        schedules the retry); ``None`` means the queue does not retry. When
        the backend raises and retries are left the job is left ``retrying``
        for the next attempt to claim, otherwise it is ``failed``. The stored
        ``error_message`` is a :class:`TransientGenerationError`'s message,
        or a fixed text for any other exception.

        The backend call runs under the job deadline. When it expires the
        backend is interrupted and the job fails as timed out, without a
        retry (the backend may still be busy with it) and without raising.
        """
        prompt: str
        mode: str
        params: DeliveryJobParams
        error: Optional[Exception] = None
        result: DeliveryJobResult
        status: str = "failed"

        with get_session_context() as session:
            service = self._delivery_service_factory(session)
            job = service.claim_job(job_id)
            if job is None:
                existing = service.get_job(job_id)
                if existing is not None:
                    # Cancelled, already finished, or taken by another runner.
                    logger.info(
                        "Delivery %s skipped: status is %s", job_id, existing.status
                    )
                return

            prompt = job.prompt
            mode = job.mode
            params = service.get_job_params(job)

        deadline_seconds = self._job_deadline_seconds()
        deadline = asyncio.timeout(deadline_seconds)
        try:
            async with deadline:
                outcome = await self._execute_delivery_backend(prompt, mode, params)
            result = DeliveryJobResult.coerce(outcome)
            status = "succeeded" if result.status in _SUCCESS_STATUSES else "failed"
        except Exception as exc:
            deadline_expired = isinstance(exc, TimeoutError) and deadline.expired()
            if deadline_expired or _is_job_timeout(exc):
                # The backend may still be busy with this job; another
                # attempt would pile onto it, so a timeout is final. The
                # runner's own deadline is not an error: the job is failed
                # and RQ has nothing to retry. RQ's timeout is re-raised.
                if deadline_expired:
                    logger.warning(
                        "Delivery %s timed out after %ss",
                        job_id,
                        f"{deadline_seconds:g}",
                    )
                else:
                    error = exc
                    logger.warning("Delivery %s hit RQ's job timeout", job_id)
                await self._interrupt_backend(mode, params)
                result = TIMED_OUT_RESULT
                status = "failed"
            else:
                error = exc
                result, status = self._failure_outcome(job_id, exc, retries_left)

        with get_session_context() as session:
            service = self._delivery_service_factory(session)
            finished = service.finish_job(job_id, status, result)

        if finished is None:
            # The job was cancelled (or failed by recovery) while it ran; its
            # stored status stands and nothing references the new images.
            if result.images:
                remove_stored_images(result.images)
            logger.info("Delivery %s finished after it stopped running", job_id)
            return

        if status in NOTIFY_STATUSES:
            await self._notify_finished(job_id, status, prompt, params, result)

        if error is not None and raise_on_error:
            raise error

    def _job_deadline_seconds(self) -> float:
        """Return how long one attempt may run (read per job, for settings)."""
        if self._deadline_seconds is not None:
            return self._deadline_seconds
        return settings.job_deadline_seconds

    @staticmethod
    def _failure_outcome(
        job_id: str, exc: Exception, retries_left: Optional[int]
    ) -> Tuple[DeliveryJobResult, str]:
        """Return the result and status to store after the backend raised.

        Only a :class:`TransientGenerationError`'s fixed message is stored;
        any other exception's text stays in the log.
        """
        if isinstance(exc, TransientGenerationError):
            logger.warning("Delivery %s failed: %s", job_id, exc.message)
            message = exc.message
        else:
            logger.exception("Delivery %s failed", job_id)
            message = PROCESSING_FAILED_MESSAGE
        if retries_left is not None and retries_left > 0:
            # RQ runs the task again; that attempt claims the job back from
            # ``retrying`` unless it was cancelled meanwhile.
            return (
                DeliveryJobResult(error_message=message, retries_left=retries_left),
                "retrying",
            )
        return DeliveryJobResult(error_message=message), "failed"

    async def _interrupt_backend(self, mode: str, params: DeliveryJobParams) -> None:
        """Ask the job's generation backend to stop rendering, best-effort."""
        resolved = self._resolve_generation_backend(mode, params)
        if resolved is None:
            return
        name, backend = resolved
        try:
            async with asyncio.timeout(INTERRUPT_TIMEOUT_SECONDS):
                await backend.interrupt()
        except Exception:
            logger.warning(
                "Interrupting %s after a timeout failed", name, exc_info=True
            )

    def _record_backstop_timeout(self, job_id: str) -> None:
        """Fail a job whose attempt RQ's job timeout killed outside the runner.

        Runs after the job's event loop is gone: the status write is
        synchronous, and the interrupt and webhook get a fresh loop. Never
        raises, so RQ still sees its own timeout exception.
        """
        try:
            with get_session_context() as session:
                service = self._delivery_service_factory(session)
                finished = service.finish_job(job_id, "failed", TIMED_OUT_RESULT)
                if finished is None:
                    # Already finished, cancelled or failed by recovery.
                    return
                prompt = finished.prompt
                mode = finished.mode
                params = service.get_job_params(finished)
            logger.warning("Delivery %s hit RQ's job timeout", job_id)

            async def after_timeout() -> None:
                await self._interrupt_backend(mode, params)
                await self._notify_finished(
                    job_id, "failed", prompt, params, TIMED_OUT_RESULT
                )

            run_with_fresh_loop(after_timeout(), registry=self._delivery_registry)
        except Exception:
            logger.exception("Recording the timeout of delivery %s failed", job_id)

    async def _notify_finished(
        self,
        job_id: str,
        status: str,
        prompt: str,
        params: DeliveryJobParams,
        result: DeliveryJobResult,
    ) -> None:
        """Announce a final job status through the webhook, if configured."""
        notifier = self._webhook_notifier or JobWebhookNotifier.from_settings()
        if notifier is None:
            return
        payload = notifier.build_payload(job_id, status, prompt, params, result)
        await notifier.send(payload)

    def _resolve_generation_backend(
        self, mode: str, params: DeliveryJobParams
    ) -> Optional[Tuple[str, GenerationBackend]]:
        """Return the job's generation backend and its name, if it has one.

        The params' ``backend`` wins over the job mode; a mode with no
        generation backend is a plain delivery backend.
        """
        candidate_names = []
        if params.backend:
            candidate_names.append(params.backend)
        if isinstance(mode, str) and mode not in candidate_names:
            candidate_names.append(mode)

        for candidate in candidate_names:
            backend = self._delivery_registry.get_generation_backend(candidate)
            if backend is not None:
                return candidate, backend
        return None

    async def _execute_delivery_backend(
        self,
        prompt: str,
        mode: str,
        params: DeliveryJobParams,
    ) -> Dict[str, Any]:
        """Execute the delivery backend associated with the job mode."""
        resolved = self._resolve_generation_backend(mode, params)
        if resolved is not None:
            backend_name, generation_backend = resolved
            gen_params_dict: Dict[str, Any] = dict(params.generation_params or {})
            gen_params_dict["prompt"] = prompt

            gen_params = SDNextGenerationParams(**gen_params_dict)
            save_images = params.save_images is not False
            # The result is stored on the job row rather than returned to a
            # caller, so saved images come back as file references, never as
            # base64 (``return_format`` only shapes immediate responses).
            full_params = {
                "generation_params": gen_params.model_dump(),
                "mode": params.mode or "immediate",
                "save_images": save_images,
                "return_format": stored_return_format(
                    save_images=save_images,
                    return_format=params.return_format or "base64",
                ),
            }
            full_params["backend"] = backend_name

            result_obj = await generation_backend.generate_image(prompt, full_params)
            return result_obj.model_dump()

        backend = self._delivery_registry.get_delivery_backend(mode)
        if backend is None:
            return {"status": "error", "detail": f"unknown mode: {mode}"}

        return await backend.deliver(prompt, params.to_payload())
