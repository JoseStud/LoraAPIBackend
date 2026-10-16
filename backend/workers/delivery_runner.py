"""Delivery job runner that orchestrates backend execution."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, Callable, Dict, Optional, Set

from sqlmodel import Session

from backend.core.database import get_session_context
from backend.delivery import run_with_fresh_loop
from backend.delivery.base import DeliveryRegistry
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
logger = logging.getLogger(__name__)

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
    ) -> None:
        """Store the registry, the delivery service factory and a webhook notifier.

        ``delivery_service_factory`` builds the :class:`DeliveryService` used to
        read and update job state for a given session; by default it goes
        through the shared service container. Without an explicit notifier,
        one is built from settings per job, so a missing ``JOB_WEBHOOK_URL``
        simply disables the webhook.
        """
        self._delivery_registry = delivery_registry
        self._webhook_notifier = webhook_notifier
        self._delivery_service_factory = (
            delivery_service_factory or _container_delivery_service
        )
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
        """

        async def runner() -> None:
            await self._process_delivery_job_async(
                job_id,
                retries_left=retries_left,
                raise_on_error=raise_on_error,
            )

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # A loop per job: close the sessions it opened before it ends.
            run_with_fresh_loop(runner(), registry=self._delivery_registry)
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
        for the next attempt to claim, otherwise it is ``failed``.
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

        try:
            result = DeliveryJobResult.coerce(
                await self._execute_delivery_backend(prompt, mode, params)
            )
            status = "succeeded" if result.status in _SUCCESS_STATUSES else "failed"
        except Exception as exc:
            error = exc
            logger.exception("Delivery %s failed", job_id)
            if _is_job_timeout(exc):
                # The backend may still be busy with this job; another
                # attempt would pile onto it, so a timeout is final.
                result = DeliveryJobResult(error_message="Delivery timed out")
                status = "failed"
            elif retries_left is not None and retries_left > 0:
                # RQ runs the task again; that attempt claims the job back
                # from ``retrying`` unless it was cancelled meanwhile.
                result = DeliveryJobResult(
                    error_message="Delivery processing failed",
                    retries_left=retries_left,
                )
                status = "retrying"
            else:
                result = DeliveryJobResult(error_message="Delivery processing failed")
                status = "failed"

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

    async def _execute_delivery_backend(
        self,
        prompt: str,
        mode: str,
        params: DeliveryJobParams,
    ) -> Dict[str, Any]:
        """Execute the delivery backend associated with the job mode."""
        backend_name = params.backend
        generation_backend = None
        candidate_names = []
        if backend_name:
            candidate_names.append(backend_name)
        if isinstance(mode, str) and mode not in candidate_names:
            candidate_names.append(mode)

        for candidate in candidate_names:
            backend = self._delivery_registry.get_generation_backend(candidate)
            if backend is not None:
                generation_backend = backend
                backend_name = candidate
                break

        if generation_backend is not None:
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
            if backend_name:
                full_params["backend"] = backend_name

            result_obj = await generation_backend.generate_image(prompt, full_params)
            return result_obj.model_dump()

        backend = self._delivery_registry.get_delivery_backend(mode)
        if backend is None:
            return {"status": "error", "detail": f"unknown mode: {mode}"}

        return await backend.deliver(prompt, params.to_payload())
