"""Delivery job runner that orchestrates backend execution."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from backend.core.database import get_session_context
from backend.delivery.base import DeliveryRegistry
from backend.schemas import SDNextGenerationParams
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository

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
            repository = DeliveryJobRepository(session)
            service = DeliveryService(repository)
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
            repository = DeliveryJobRepository(session)
            service = DeliveryService(repository)
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
            full_params = {
                "generation_params": gen_params.model_dump(),
                "mode": params_dict.get("mode", "immediate"),
                "save_images": params_dict.get("save_images", True),
                "return_format": params_dict.get("return_format", "base64"),
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

