"""Tests for the built-in HTTP and CLI delivery backends."""

from __future__ import annotations

import asyncio
import os

import aiohttp

from backend.delivery import cli as cli_module
from backend.delivery.cli import CLIDeliveryBackend
from backend.delivery.http import HTTPDeliveryBackend

SECRET = "internal-detail-/srv/secret/path"


def _deliver(backend, prompt, params):
    return asyncio.run(backend.deliver(prompt, params))


def test_cli_template_substitutes_prompt_literally():
    """Format-spec attribute lookups in the template are not evaluated."""
    result = _deliver(
        CLIDeliveryBackend(),
        "a red fox",
        {"template": "{prompt.__class__} {prompt}"},
    )

    assert result["status"] == "ok"
    path = result["file_path"]
    try:
        with open(path) as handle:
            assert handle.read() == "{prompt.__class__} a red fox"
    finally:
        os.remove(path)


def test_cli_template_keeps_other_braces():
    """Braces that are not ``{prompt}`` no longer raise format errors."""
    result = _deliver(CLIDeliveryBackend(), "p", {"template": "{} {0} {prompt}"})

    path = result["file_path"]
    try:
        with open(path) as handle:
            assert handle.read() == "{} {0} p"
    finally:
        os.remove(path)


def test_cli_errors_do_not_expose_exception_text(monkeypatch, caplog):
    """A failing write returns a generic detail and logs the cause."""

    def failing_mkstemp(*args, **kwargs):
        raise OSError(SECRET)

    monkeypatch.setattr(cli_module.tempfile, "mkstemp", failing_mkstemp)

    with caplog.at_level("ERROR", logger="backend.delivery.cli"):
        result = _deliver(CLIDeliveryBackend(), "p", {})

    assert result["status"] == "error"
    assert SECRET not in repr(result)
    assert SECRET in caplog.text


def test_http_errors_do_not_expose_exception_text(monkeypatch, caplog):
    """A failing request returns a generic detail and logs the cause."""

    class ExplodingSession:
        def __init__(self, *args, **kwargs):
            raise aiohttp.ClientError(SECRET)

    monkeypatch.setattr(aiohttp, "ClientSession", ExplodingSession)

    with caplog.at_level("ERROR", logger="backend.delivery.http"):
        result = _deliver(HTTPDeliveryBackend(), "p", {"host": "example.invalid"})

    assert result["status"] == "error"
    assert SECRET not in repr(result)
    assert SECRET in caplog.text
