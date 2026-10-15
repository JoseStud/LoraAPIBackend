"""Delivery job runner that orchestrates backend execution."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, Callable, Dict, Optional, Set

from sqlmodel import Session

from backend.core.database import get_session_context
from backend.delivery.base import DeliveryRegistry
from backend.delivery.storage import remove_stored_images, stored_return_format
from backend.schemas import SDNextGenerationParams
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

        Without a running event loop (an RQ worker, or a FastAPI background
        task in the threadpool) the job runs to completion before this
        returns. On a running loop it is scheduled as a task, which is
        returned.
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
            asyncio.run(runner())
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
        """Load delivery state and execute the selected backend."""
        prompt: str
        mode: str
        params: Dict[str, Any]
        error: Optional[Exception] = None
        result_payload: Dict[str, Any] = {}
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
            result_payload = await self._execute_delivery_backend(prompt, mode, params)
            status = (
                "succeeded" if self._is_successful_result(result_payload) else "failed"
            )
        except Exception as exc:  # pragma: no cover - defensive branch
            error = exc
            logger.exception("Delivery %s failed", job_id)
            result_payload = {"error": "Delivery processing failed"}
            if retries_left is not None and retries_left > 0:
                result_payload["retries_left"] = retries_left
                status = "retrying"
            else:
                status = "failed"

        with get_session_context() as session:
            service = self._delivery_service_factory(session)
            finished = service.finish_job(job_id, status, result_payload)

        if finished is None:
            # The job was cancelled (or failed by recovery) while it ran; its
            # stored status stands and nothing references the new images.
            images = result_payload.get("images")
            if isinstance(images, list):
                remove_stored_images(images)
            logger.info("Delivery %s finished after it stopped running", job_id)
            return

        if status in NOTIFY_STATUSES:
            await self._notify_finished(job_id, status, prompt, params, result_payload)

        if error is not None and raise_on_error:
            raise error

    async def _notify_finished(
        self,
        job_id: str,
        status: str,
        prompt: str,
        params: Dict[str, Any],
        result: Dict[str, Any],
    ) -> None:
        """Announce a final job status through the webhook, if configured."""
        notifier = self._webhook_notifier or JobWebhookNotifier.from_settings()
        if notifier is None:
            return
        payload = notifier.build_payload(
            job_id,
            status,
            prompt,
            params if isinstance(params, dict) else {},
            result,
        )
        await notifier.send(payload)

    async def _execute_delivery_backend(
        self,
        prompt: str,
        mode: str,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute the delivery backend associated with the job mode."""
        params_dict = params if isinstance(params, dict) else {}

        backend_name: Optional[str] = None
        maybe_backend = params_dict.get("backend")
        if isinstance(maybe_backend, str):
            backend_name = maybe_backend

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
            gen_params_dict: Dict[str, Any] = {}
            raw_generation_params = params_dict.get("generation_params")
            if isinstance(raw_generation_params, dict):
                gen_params_dict.update(raw_generation_params)
            gen_params_dict["prompt"] = prompt

            gen_params = SDNextGenerationParams(**gen_params_dict)
            save_images = bool(params_dict.get("save_images", True))
            return_format = params_dict.get("return_format", "base64")
            # The result is stored on the job row rather than returned to a
            # caller, so saved images come back as file references, never as
            # base64 (``return_format`` only shapes immediate responses).
            full_params = {
                "generation_params": gen_params.model_dump(),
                "mode": params_dict.get("mode", "immediate"),
                "save_images": save_images,
                "return_format": stored_return_format(
                    save_images=save_images,
                    return_format=return_format,
                ),
            }
            if backend_name:
                full_params["backend"] = backend_name

            result_obj = await generation_backend.generate_image(prompt, full_params)
            return result_obj.model_dump()

        backend = self._delivery_registry.get_delivery_backend(mode)
        if backend is None:
            return {"status": "error", "detail": f"unknown mode: {mode}"}

        return await backend.deliver(prompt, params)

    @staticmethod
    def _is_successful_result(result: Dict[str, Any]) -> bool:
        status = result.get("status")
        return status in _SUCCESS_STATUSES
