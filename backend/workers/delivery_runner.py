"""Delivery job runner that orchestrates backend execution."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from backend.core.database import get_session_context
from backend.delivery.base import DeliveryRegistry
from backend.schemas import SDNextGenerationParams
from backend.services.deliveries import DeliveryService

_SUCCESS_STATUSES = {"ok", "completed", 200}


class DeliveryRunner:
    """Coordinate delivery job execution using registered backends."""

    def __init__(self, delivery_registry: DeliveryRegistry) -> None:
        self._delivery_registry = delivery_registry

    def process_delivery_job(
        self,
        job_id: str,
        retries_left: Optional[int] = None,
        *,
        raise_on_error: bool = False,
    ) -> None:
        """Process a delivery job, mirroring the previous synchronous helper."""

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
        else:  # pragma: no cover - defensive branch
            task = loop.create_task(runner())
            if raise_on_error:
                raise RuntimeError(
                    "Cannot raise errors when scheduling delivery processing on an"
                    " active event loop",
                )
            return task

    async def _process_delivery_job_async(
        self,
        job_id: str,
        *,
        retries_left: Optional[int] = None,
        raise_on_error: bool = False,
    ) -> None:
        """Internal coroutine that loads state and executes the backend."""

        prompt: str
        mode: str
        params: Dict[str, Any]
        error: Optional[Exception] = None
        result_payload: Dict[str, Any] = {}
        status: str = "failed"

        with get_session_context() as session:
            service = DeliveryService(session)
            job = service.get_job(job_id)
            if job is None:
                return

            service.update_job_status(job_id, "running")
            prompt = job.prompt
            mode = job.mode
            params = service.get_job_params(job)

        try:
            result_payload = await self._execute_delivery_backend(prompt, mode, params)
            status = "succeeded" if self._is_successful_result(result_payload) else "failed"
        except Exception as exc:  # pragma: no cover - defensive branch
            error = exc
            result_payload = {"error": str(exc)}
            if retries_left is not None and retries_left > 0:
                result_payload["retries_left"] = retries_left
                status = "retrying"
            else:
                status = "failed"

        with get_session_context() as session:
            service = DeliveryService(session)
            service.update_job_status(job_id, status, result_payload)

        if error is not None and raise_on_error:
            raise error

    async def _execute_delivery_backend(
        self,
        prompt: str,
        mode: str,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute the delivery backend associated with the job mode."""

        if mode == "sdnext":
            backend = self._delivery_registry.get_generation_backend("sdnext")
            if backend is None:
                return {"status": "error", "detail": "generation backend 'sdnext' not found"}

            gen_params_dict = params.get("generation_params", {}).copy()
            gen_params_dict["prompt"] = prompt

            gen_params = SDNextGenerationParams(**gen_params_dict)
            full_params = {
                "generation_params": gen_params.model_dump(),
                "mode": params.get("mode", "immediate"),
                "save_images": params.get("save_images", True),
                "return_format": params.get("return_format", "base64"),
            }
            result_obj = await backend.generate_image(prompt, full_params)
            return result_obj.model_dump()

        backend = self._delivery_registry.get_delivery_backend(mode)
        if backend is None:
            return {"status": "error", "detail": f"unknown mode: {mode}"}

        return await backend.deliver(prompt, params)

    @staticmethod
    def _is_successful_result(result: Dict[str, Any]) -> bool:
        status = result.get("status")
        return status in _SUCCESS_STATUSES

