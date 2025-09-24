"""Slim integration tests for the SDNext generation backend."""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

import pytest

from backend.delivery.sdnext import SDNextGenerationBackend
from backend.delivery.sdnext_client import SDNextResponse


class FakeSDNextSession:
    def __init__(
        self,
        *,
        configured: bool = True,
        healthy: bool = True,
        submit_response: Optional[SDNextResponse] = None,
        progress_response: Optional[SDNextResponse] = None,
    ) -> None:
        self._configured = configured
        self._healthy = healthy
        self._submit_response = submit_response or SDNextResponse(
            ok=True,
            status=200,
            data={"images": [], "info": {}},
        )
        self._progress_response = progress_response or SDNextResponse(
            ok=True,
            status=200,
            data={"progress": 0.0},
        )

        self.submissions: list[tuple[str, Dict[str, Any]]] = []
        self.progress_checks = 0
        self.closed = False

    def is_configured(self) -> bool:
        return self._configured

    async def close(self) -> None:
        self.closed = True

    async def health_check(self) -> bool:
        return self._healthy

    async def submit_txt2img(
        self,
        prompt: str,
        generation_params: Dict[str, Any],
    ) -> SDNextResponse:
        self.submissions.append((prompt, generation_params))
        return self._submit_response

    async def get_progress(self) -> SDNextResponse:
        self.progress_checks += 1
        return self._progress_response


class FakeImageStorage:
    def __init__(
        self, processed: Optional[list[str]] = None, *, fail: bool = False
    ) -> None:
        self.processed = processed or []
        self.fail = fail
        self.calls: list[tuple[list[str], str, bool, str]] = []

    async def persist_images(
        self,
        images: Iterable[str],
        job_id: str,
        *,
        save_images: bool,
        return_format: str,
    ) -> list[str]:
        self.calls.append((list(images), job_id, save_images, return_format))
        if self.fail:
            raise RuntimeError("storage failure")
        return self.processed


@pytest.mark.anyio("asyncio")
async def test_generate_image_success_flow() -> None:
    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=True,
            status=200,
            data={"images": ["raw"], "info": {"mode": "test"}},
        ),
    )
    storage = FakeImageStorage(processed=["processed"])
    backend = SDNextGenerationBackend(session=session, storage=storage)

    result = await backend.generate_image(
        "Prompt",
        {"generation_params": {"steps": 5}, "return_format": "base64"},
    )

    assert result.status == "completed"
    assert result.images == ["processed"]
    assert result.generation_info == {"mode": "test"}
    assert session.submissions == [("Prompt", {"steps": 5})]
    assert len(storage.calls) == 1
    images, job_id, _, return_format = storage.calls[0]
    assert images == ["raw"]
    assert result.job_id == job_id
    assert return_format == "base64"


@pytest.mark.anyio("asyncio")
async def test_generate_image_session_error() -> None:
    session = FakeSDNextSession(
        submit_response=SDNextResponse(ok=False, status=500, error="bad request"),
    )
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert result.error_message == "bad request"


@pytest.mark.anyio("asyncio")
async def test_generate_image_health_check_failure() -> None:
    session = FakeSDNextSession(healthy=False)
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert result.error_message == "SDNext API not available"
    assert session.submissions == []


@pytest.mark.anyio("asyncio")
async def test_generate_image_storage_failure_returns_error() -> None:
    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=True,
            status=200,
            data={"images": ["img"], "info": {}},
        ),
    )
    storage = FakeImageStorage(fail=True)
    backend = SDNextGenerationBackend(session=session, storage=storage)

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert "storage failure" in (result.error_message or "")


@pytest.mark.anyio("asyncio")
async def test_progress_success_and_status_translation() -> None:
    session = FakeSDNextSession(
        progress_response=SDNextResponse(ok=True, status=200, data={"progress": 1.0}),
    )
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    result = await backend.check_progress("job-1")

    assert result.status == "completed"
    assert result.progress == 1.0
    assert session.progress_checks == 1


@pytest.mark.anyio("asyncio")
async def test_progress_session_error_produces_unknown_status() -> None:
    session = FakeSDNextSession(
        progress_response=SDNextResponse(ok=False, status=500, error="oops"),
    )
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    result = await backend.check_progress("job-2")

    assert result.status == "unknown"
    assert result.error_message == "oops"
