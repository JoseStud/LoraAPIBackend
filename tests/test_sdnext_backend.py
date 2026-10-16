"""Slim integration tests for the SDNext generation backend."""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

import pytest

from backend.delivery.base import TransientGenerationError
from backend.delivery.sdnext import NO_IMAGES_MESSAGE, SDNextGenerationBackend
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
            data={"images": ["raw"], "info": {}},
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
async def test_generate_image_permanent_session_error_is_a_failed_result() -> None:
    """A failure a retry would repeat (HTTP 4xx) is a failed result."""
    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=False, status=422, error="SDNext returned HTTP 422"
        ),
    )
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert result.error_message == "SDNext returned HTTP 422"


@pytest.mark.anyio("asyncio")
@pytest.mark.parametrize(
    "error",
    ["SDNext returned HTTP 503", "SDNext request timed out", "SDNext request failed"],
)
async def test_generate_image_transient_session_error_raises(error) -> None:
    """Timeouts, connection errors, 429 and 5xx raise, so the queue retries."""
    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=False, status=None, error=error, transient=True
        ),
    )
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    with pytest.raises(TransientGenerationError) as raised:
        await backend.generate_image("Prompt", {"generation_params": {}})

    assert raised.value.message == error


@pytest.mark.anyio("asyncio")
async def test_generate_image_health_check_failure_is_transient() -> None:
    session = FakeSDNextSession(healthy=False)
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    with pytest.raises(TransientGenerationError) as raised:
        await backend.generate_image("Prompt", {"generation_params": {}})

    assert raised.value.message == "SDNext API not available"
    assert session.submissions == []


@pytest.mark.anyio("asyncio")
async def test_generate_image_not_configured_is_a_failed_result() -> None:
    session = FakeSDNextSession(configured=False)
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert result.error_message == "SDNext backend not configured"


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
    assert result.error_message == "Could not save generated images"


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


@pytest.mark.anyio
async def test_pre_generate_command_runs_before_submission(tmp_path, monkeypatch):
    """The configured command finishes before SD.Next gets the job."""
    from backend.delivery import sdnext as sdnext_module

    marker = tmp_path / "ran"
    session = FakeSDNextSession()
    seen_marker_at_submit: list[bool] = []
    original_submit = session.submit_txt2img

    async def submit(prompt, params):
        seen_marker_at_submit.append(marker.exists())
        return await original_submit(prompt, params)

    session.submit_txt2img = submit  # type: ignore[method-assign]
    monkeypatch.setattr(
        sdnext_module.settings, "SDNEXT_PRE_GENERATE_COMMAND", f"touch {marker}"
    )

    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())
    await backend.generate_image("prompt", {"generation_params": {}})

    assert seen_marker_at_submit == [True]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "command", ["false", "definitely-not-a-real-command-xyz", "sleep 5"]
)
async def test_failing_pre_generate_command_does_not_block_generation(
    monkeypatch, command
):
    from backend.delivery import sdnext as sdnext_module

    monkeypatch.setattr(sdnext_module.settings, "SDNEXT_PRE_GENERATE_COMMAND", command)
    monkeypatch.setattr(sdnext_module.settings, "SDNEXT_PRE_GENERATE_TIMEOUT", 1)
    session = FakeSDNextSession()

    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())
    await backend.generate_image("prompt", {"generation_params": {}})

    assert len(session.submissions) == 1


@pytest.mark.anyio("asyncio")
async def test_empty_image_list_reports_an_aborted_job() -> None:
    """SD.Next answers 200 with no images when it aborts (e.g. GPU OOM).

    The model may have finished loading by the next attempt, so it is
    transient.
    """
    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=True, status=200, data={"images": [], "info": "{}"}
        )
    )

    with pytest.raises(TransientGenerationError) as raised:
        await SDNextGenerationBackend(session=session).generate_image(
            "prompt", {"generation_params": {}}
        )

    assert raised.value.message == NO_IMAGES_MESSAGE
    assert "returned no images" in raised.value.message


class InterruptSession(FakeSDNextSession):
    def __init__(self, *, ok: bool = True, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.interrupts = 0
        self._ok = ok

    async def interrupt(self) -> SDNextResponse:
        self.interrupts += 1
        return SDNextResponse(ok=self._ok, status=200 if self._ok else 500)


@pytest.mark.anyio("asyncio")
async def test_interrupt_forwards_to_sdnext() -> None:
    session = InterruptSession()
    backend = SDNextGenerationBackend(session=session, storage=FakeImageStorage())

    assert await backend.interrupt() is True
    assert session.interrupts == 1


@pytest.mark.anyio("asyncio")
async def test_interrupt_reports_failure_and_skips_unconfigured() -> None:
    failing = InterruptSession(ok=False)
    backend = SDNextGenerationBackend(session=failing, storage=FakeImageStorage())
    assert await backend.interrupt() is False

    unconfigured = InterruptSession(configured=False)
    backend = SDNextGenerationBackend(session=unconfigured, storage=FakeImageStorage())
    assert await backend.interrupt() is False
    assert unconfigured.interrupts == 0
