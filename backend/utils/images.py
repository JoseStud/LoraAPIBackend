"""Helpers for handing stored generation images to the browser."""

from __future__ import annotations

import base64
import binascii
from typing import Optional

__all__ = ["to_browser_image_src"]

_IMAGE_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF8", "image/gif"),
)


def _sniff_base64_image(value: str) -> Optional[str]:
    """Return the MIME type of raw base64 image data, or ``None``."""
    try:
        head = base64.b64decode(value[:32], validate=True)
    except (binascii.Error, ValueError):
        return None
    for signature, mime in _IMAGE_SIGNATURES:
        if head.startswith(signature):
            return mime
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def to_browser_image_src(value: str) -> Optional[str]:
    """Turn a stored image reference into something an ``<img>`` can load.

    Results store raw base64 by default, which browsers resolve as a relative
    URL, so it is wrapped in a data URI. Server file paths are not reachable
    from the browser and yield ``None``.
    """
    candidate = value.strip()
    if candidate.startswith(("data:", "http://", "https://")):
        return candidate
    mime = _sniff_base64_image(candidate)
    if mime is None:
        return None
    return f"data:{mime};base64,{candidate}"
