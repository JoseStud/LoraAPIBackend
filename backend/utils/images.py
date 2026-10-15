"""Helpers for stored generation images and their browser sources.

Job results store an image saved to disk as an *output reference*: the
``output://`` prefix followed by the file's path relative to the generation
output directory (``SDNEXT_OUTPUT_DIR``). The browser loads those through
``GET /api/v1/generation/results/{job_id}/images/{index}``. Results written
before references existed hold raw base64, which still renders as a data URI.
"""

from __future__ import annotations

import base64
import binascii
from pathlib import Path, PurePosixPath
from typing import Optional

from backend.core.config import settings

__all__ = [
    "OUTPUT_REFERENCE_PREFIX",
    "make_output_reference",
    "parse_output_reference",
    "resolve_output_dir",
    "result_image_path",
    "to_browser_image_src",
]

OUTPUT_REFERENCE_PREFIX = "output://"
"""Marks a stored image as a file under the output directory.

``:`` is not in the base64 alphabet, so a reference can never be mistaken for
legacy base64 image data.
"""

_DEFAULT_OUTPUT_DIRNAME = "generated_images"

_IMAGE_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF8", "image/gif"),
)


def resolve_output_dir(output_dir: Optional[str] = None) -> Path:
    """Return the directory generated images are written to.

    ``output_dir`` defaults to ``SDNEXT_OUTPUT_DIR``; without either, images
    go to ``generated_images`` under the working directory.
    """
    configured = output_dir if output_dir else settings.SDNEXT_OUTPUT_DIR
    if configured:
        return Path(configured)
    return Path.cwd() / _DEFAULT_OUTPUT_DIRNAME


def make_output_reference(relative_path: str) -> str:
    """Return the stored reference for ``relative_path`` in the output directory."""
    return f"{OUTPUT_REFERENCE_PREFIX}{PurePosixPath(relative_path).as_posix()}"


def parse_output_reference(value: str) -> Optional[str]:
    """Return the relative path held by an output reference, or ``None``."""
    candidate = value.strip()
    if not candidate.startswith(OUTPUT_REFERENCE_PREFIX):
        return None
    relative = candidate[len(OUTPUT_REFERENCE_PREFIX) :]
    return relative or None


def result_image_path(job_id: str, index: int) -> str:
    """Return the browser path of the route that serves a stored result image."""
    return f"/api/v1/generation/results/{job_id}/images/{index}"


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


def to_browser_image_src(
    value: str,
    *,
    job_id: str,
    index: Optional[int],
) -> Optional[str]:
    """Turn a stored image value into something an ``<img>`` can load.

    - an output reference (or a legacy ``file://`` path) becomes the URL of
      the result image route for ``job_id``/``index``; without an ``index``
      there is no route for it and the result is ``None``;
    - raw base64 (results stored before references) becomes a data URI;
    - ``data:`` and ``http(s):`` URLs are returned unchanged;
    - anything else, such as a bare server path, yields ``None``.
    """
    candidate = value.strip()
    if not candidate:
        return None
    if candidate.startswith(("data:", "http://", "https://")):
        return candidate
    if candidate.startswith((OUTPUT_REFERENCE_PREFIX, "file://")):
        if index is None:
            return None
        return result_image_path(job_id, index)
    mime = _sniff_base64_image(candidate)
    if mime is None:
        return None
    return f"data:{mime};base64,{candidate}"
