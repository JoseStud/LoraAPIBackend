"""Unit tests for the SDNext generation backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

import pytest

from backend.delivery.sdnext import SDNextGenerationBackend
from backend.delivery.storage import ImageStorage


class _FakeResponse:
    def __init__(self, status: int, json_data: Optional[Dict[str, Any]] = None, text: str = "") -> None:
        self.status = status
        self._json_data = json_data or {}
        self._text = text

    async def json(self) -> Dict[str, Any]:
        return self._json_data

    async def text(self) -> str:
        return self._text


class FakeHTTPClient:
    def __init__(
        self,
        *,
        status: int,
        json_data: Optional[Dict[str, Any]] = None,
        text: str = "",
        health: bool = True,
    ) -> None:
        self._status = status
        self._json_data = json_data or {}
        self._text = text
        self._health = health
        self.requests = []
        self.closed = False
        self.health_checks = 0

    def is_configured(self) -> bool:
        return True

    async def request(self, method: str, path: str, **kwargs: Any):
        self.requests.append((method, path, kwargs))
        response = _FakeResponse(self._status, self._json_data, self._text)

        @asynccontextmanager
        async def ctx():
            yield response

        return ctx()

    async def health_check(self, path: Optional[str] = None) -> bool:  # noqa: ARG002 - path not used in fake
        self.health_checks += 1
        return self._health

    async def close(self) -> None:
        self.closed = True


class RecordingStorage(ImageStorage):
    def __init__(self) -> None:
        self.calls = []

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        self.calls.append((img_b64, job_id, index))
        return "saved-path"


class FailingStorage(ImageStorage):
    def __init__(self) -> None:
        self.calls = 0

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        self.calls += 1
        raise RuntimeError("boom")


@pytest.mark.anyio("asyncio")
async def test_generate_image_api_error() -> None:
    client = FakeHTTPClient(status=500, text="failure", json_data={})
    storage = RecordingStorage()
    backend = SDNextGenerationBackend(http_client=client, storage=storage)

    result = await backend.generate_image("Prompt", {"generation_params": {}})

    assert result.status == "failed"
    assert "500" in (result.error_message or "")
    assert storage.calls == []  # storage should not be invoked on API failure
    assert client.requests[0][0] == "POST"
    assert client.requests[0][1] == "/sdapi/v1/txt2img"


@pytest.mark.anyio("asyncio")
async def test_generate_image_storage_failure() -> None:
    payload = {"images": ["aGVsbG8="], "info": {"mode": "test"}}
    client = FakeHTTPClient(status=200, json_data=payload)
    storage = FailingStorage()
    backend = SDNextGenerationBackend(http_client=client, storage=storage)

    result = await backend.generate_image("Prompt", {"generation_params": {}, "return_format": "file_path"})

    assert result.status == "completed"
    assert result.images == []
    assert result.generation_info == payload["info"]
    assert storage.calls == 1
