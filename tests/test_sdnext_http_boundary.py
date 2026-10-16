"""Exercise errors raised when entering an aiohttp request context."""

import asyncio
from unittest.mock import AsyncMock

import aiohttp
import pytest

from backend.delivery.sdnext import SDNextGenerationBackend
from backend.delivery.sdnext_client import SDNextSession
from backend.delivery.storage import FileSystemImageStorage


class ResponseContext:
    def __init__(self, *, status=200, data=None, error=None, json_error=None):
        self.status = status
        self.data = data
        self.error = error
        self.json_error = json_error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self

    async def __aexit__(self, *args):
        pass

    async def json(self):
        if self.json_error:
            raise self.json_error
        return self.data

    async def text(self):
        return "private-upstream-detail"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("response", "expected", "transient"),
    [
        (
            ResponseContext(error=asyncio.TimeoutError()),
            "SDNext request timed out",
            True,
        ),
        (
            ResponseContext(error=aiohttp.ClientConnectionError("secret")),
            "SDNext request failed",
            True,
        ),
        (
            ResponseContext(error=ConnectionRefusedError("secret")),
            "SDNext request failed",
            True,
        ),
        (
            ResponseContext(error=RuntimeError("secret")),
            "SDNext request failed",
            False,
        ),
        (ResponseContext(status=503), "SDNext returned HTTP 503", True),
        (ResponseContext(status=500), "SDNext returned HTTP 500", True),
        (ResponseContext(status=429), "SDNext returned HTTP 429", True),
        (ResponseContext(status=422), "SDNext returned HTTP 422", False),
        (ResponseContext(status=401), "SDNext returned HTTP 401", False),
        (ResponseContext(data=[]), "Invalid SDNext response", False),
        (
            ResponseContext(json_error=ValueError("secret")),
            "Invalid SDNext response",
            False,
        ),
    ],
)
async def test_transport_error_is_safe_and_classified(response, expected, transient):
    client = AsyncMock()
    client.is_configured = lambda: True
    client.request.return_value = response
    session = SDNextSession(client)
    result = await session.submit_txt2img("ordinary prompt")
    assert result.ok is False
    assert result.error == expected
    assert result.transient is transient
    assert "secret" not in result.error
    assert "private-upstream-detail" not in result.error


@pytest.mark.anyio
async def test_storage_failure_does_not_silently_succeed(tmp_path):
    storage = FileSystemImageStorage(str(tmp_path))
    with pytest.raises(ValueError):
        await storage.persist_images(
            ["invalid-base64!"], "job", save_images=True, return_format="base64"
        )


@pytest.mark.anyio
async def test_sdnext_string_info_is_supported():
    from backend.delivery.sdnext_client import SDNextResponse
    from tests.test_sdnext_backend import FakeImageStorage, FakeSDNextSession

    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=True,
            status=200,
            data={"images": ["fixture"], "info": '{"seed": 42}'},
        )
    )
    backend = SDNextGenerationBackend(
        session=session, storage=FakeImageStorage(["fixture"])
    )
    result = await backend.generate_image("prompt", {})
    assert result.status == "completed"
    assert result.generation_info == {"seed": 42}


@pytest.mark.anyio
async def test_interrupt_posts_without_reading_json():
    response = ResponseContext(status=200, data=None)
    client = AsyncMock()
    client.is_configured = lambda: True
    client.request.return_value = response
    session = SDNextSession(client)

    result = await session.interrupt()

    assert result.ok is True
    method, path = client.request.call_args.args[:2]
    assert (method, path) == ("POST", "/sdapi/v1/interrupt")
