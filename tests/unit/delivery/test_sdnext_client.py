"""Unit tests for the SDNext HTTP session helper."""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from backend.core.config import settings
from backend.delivery.sdnext_client import SDNextSession


class _FakeResponse:
    def __init__(self, status: int, json_data: dict | None = None, text: str = "") -> None:
        self.status = status
        self._json_data = json_data or {}
        self._text = text

    async def json(self) -> dict:
        return self._json_data

    async def text(self) -> str:
        return self._text


class FakeDeliveryHTTPClient:
    def __init__(self) -> None:
        self.requests = []
        self.responses: dict[str, _FakeResponse] = {}
        self.closed = False
        self._configured = True

    def is_configured(self) -> bool:
        return self._configured

    async def close(self) -> None:
        self.closed = True

    async def health_check(self) -> bool:  # pragma: no cover - not used in tests
        return True

    async def request(self, method: str, path: str, **kwargs):
        self.requests.append((method, path, kwargs))
        response = self.responses[path]

        @asynccontextmanager
        async def ctx():
            yield response

        return ctx()


@pytest.mark.anyio("asyncio")
async def test_submit_txt2img_success() -> None:
    http_client = FakeDeliveryHTTPClient()
    http_client.responses["/sdapi/v1/txt2img"] = _FakeResponse(
        200, {"images": ["img"], "info": {}},
    )

    session = SDNextSession(http_client)

    response = await session.submit_txt2img(
        "A prompt",
        {
            "steps": 7,
            "sampler_name": "sampler",
            "cfg_scale": 5.5,
            "width": 320,
            "height": 256,
            "seed": 42,
            "batch_size": 2,
            "n_iter": 3,
            "negative_prompt": "neg",
        },
    )

    assert response.ok is True
    assert response.data is not None and response.data["images"] == ["img"]
    (method, path, kwargs), *_ = http_client.requests
    assert method == "POST"
    assert path == "/sdapi/v1/txt2img"

    payload = kwargs["json"]
    assert payload["prompt"] == "A prompt"
    assert payload["steps"] == 7
    assert payload["sampler_name"] == "sampler"
    assert payload["cfg_scale"] == 5.5
    assert payload["width"] == 320
    assert payload["height"] == 256
    assert payload["seed"] == 42
    assert payload["batch_size"] == 2
    assert payload["n_iter"] == 3
    assert payload["negative_prompt"] == "neg"


@pytest.mark.anyio("asyncio")
async def test_submit_txt2img_defaults_and_denoising() -> None:
    http_client = FakeDeliveryHTTPClient()
    http_client.responses["/sdapi/v1/txt2img"] = _FakeResponse(200, {"images": []})

    session = SDNextSession(http_client)

    response = await session.submit_txt2img("prompt", {"denoising_strength": 0.3})
    assert response.ok is True
    payload = http_client.requests[0][2]["json"]

    assert payload["steps"] == settings.SDNEXT_DEFAULT_STEPS
    assert payload["sampler_name"] == settings.SDNEXT_DEFAULT_SAMPLER
    assert payload["cfg_scale"] == settings.SDNEXT_DEFAULT_CFG_SCALE
    assert payload["denoising_strength"] == 0.3


@pytest.mark.anyio("asyncio")
async def test_submit_txt2img_error_status() -> None:
    http_client = FakeDeliveryHTTPClient()
    http_client.responses["/sdapi/v1/txt2img"] = _FakeResponse(500, text="failure")

    session = SDNextSession(http_client)

    response = await session.submit_txt2img("prompt", {})

    assert response.ok is False
    assert response.status == 500
    assert response.error == "failure"


@pytest.mark.anyio("asyncio")
async def test_get_progress_success() -> None:
    http_client = FakeDeliveryHTTPClient()
    http_client.responses["/sdapi/v1/progress"] = _FakeResponse(200, {"progress": 0.6})

    session = SDNextSession(http_client)

    response = await session.get_progress()

    assert response.ok is True
    assert response.data == {"progress": 0.6}
    assert http_client.requests[0][0] == "GET"


@pytest.mark.anyio("asyncio")
async def test_get_progress_error_status() -> None:
    http_client = FakeDeliveryHTTPClient()
    http_client.responses["/sdapi/v1/progress"] = _FakeResponse(404, text="missing")

    session = SDNextSession(http_client)

    response = await session.get_progress()

    assert response.ok is False
    assert response.status == 404
    assert response.error == "missing"

