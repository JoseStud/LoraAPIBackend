"""Slim integration tests for the SDNext generation backend."""

from __future__ import annotations

from typing import Any, Dict, Optional

import pytest

from backend.delivery.sdnext import SDNextGenerationBackend
from backend.delivery.sdnext_client import SDNextClientError


class FakeSDNextClient:
    def __init__(
        self,
        *,
        configured: bool = True,
        healthy: bool = True,
        submit_result: Optional[Dict[str, Any]] = None,
        submit_error: Optional[Exception] = None,
        progress_result: Optional[Dict[str, Any]] = None,
        progress_error: Optional[Exception] = None,
    ) -> None:
        self._configured = configured
        self._healthy = healthy
        self._submit_result = submit_result or {"images": [], "info": {}}
        self._submit_error = submit_error
        self._progress_result = progress_result or {"progress": 0.0}
        self._progress_error = progress_error

        self.submissions: list[tuple[str, Dict[str, Any]]] = []
        self.progress_checks = 0
        self.closed = False

    def is_configured(self) -> bool:
        return self._configured

    async def close(self) -> None:
        self.closed = True

    async def health_check(self) -> bool:
        return self._healthy

    async def submit_txt2img(self, prompt: str, generation_params: Dict[str, Any]) -> Dict[str, Any]:
        self.submissions.append((prompt, generation_params))
        if self._submit_error is not None:
            raise self._submit_error
        return self._submit_result

    async def get_progress(self) -> Dict[str, Any]:
        self.progress_checks += 1
        if self._progress_error is not None:
            raise self._progress_error
        return self._progress_result


class FakeImagePersistence:
    def __init__(self, processed: Optional[list[str]] = None) -> None:
        self.processed = processed or []
        self.calls: list[tuple[list[str], str, bool, str]] = []

    async def persist_images(
        self,
        images: list[str],
        job_id: str,
        *,
        save_images: bool,
        return_format: str,
    ) -> list[str]:
        self.calls.append((list(images), job_id, save_images, return_format))
        return self.processed


@pytest.mark.anyio("asyncio")
async def test_generate_image_success_flow() -> None:
    client = FakeSDNextClient(submit_result={"images": ["raw"], "info": {"mode": "test"}})
    persistence = FakeImagePersistence(processed=["processed"])
    backend = SDNextGenerationBackend(client=client, image_persistence=persistence)

    result = await backend.generate_image("Prompt", {"generation_params": {"steps": 5}, "return_format": "base64"})

    assert result.status == "completed"
    assert result.images == ["processed"]
    assert result.generation_info == {"mode": "test"}
    assert client.submissions == [("Prompt", {"steps": 5})]
    assert len(persistence.calls) == 1
    _, job_id, _, return_format = persistence.calls[0]
    assert result.job_id == job_id
    assert return_format == "base64"


@pytest.mark.anyio("asyncio")
async def test_generate_image_client_error() -> None:
    client = FakeSDNextClient(submit_error=SDNextClientError("bad request", status=400))
    backend = SDNextGenerationBackend(client=client, image_persistence=FakeImagePersistence())

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert "bad request" in (result.error_message or "")


@pytest.mark.anyio("asyncio")
async def test_generate_image_health_check_failure() -> None:
    client = FakeSDNextClient(healthy=False)
    backend = SDNextGenerationBackend(client=client, image_persistence=FakeImagePersistence())

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert result.error_message == "SDNext API not available"
    assert client.submissions == []


@pytest.mark.anyio("asyncio")
async def test_progress_success_and_status_translation() -> None:
    client = FakeSDNextClient(progress_result={"progress": 1.0})
    backend = SDNextGenerationBackend(client=client, image_persistence=FakeImagePersistence())

    result = await backend.check_progress("job-1")

    assert result.status == "completed"
    assert result.progress == 1.0
    assert client.progress_checks == 1


@pytest.mark.anyio("asyncio")
async def test_progress_client_error_produces_unknown_status() -> None:
    client = FakeSDNextClient(progress_error=SDNextClientError("oops", status=500))
    backend = SDNextGenerationBackend(client=client, image_persistence=FakeImagePersistence())

    result = await backend.check_progress("job-2")

    assert result.status == "unknown"
    assert result.error_message == "Could not check progress"
