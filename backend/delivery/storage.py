"""Storage abstractions for generation outputs."""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional

from backend.core.logging import get_logger
from backend.utils.images import (
    make_output_reference,
    parse_output_reference,
    resolve_output_dir,
)

logger = get_logger(__name__)

REFERENCE_FORMAT = "reference"
"""Internal ``return_format``: save each image and return its output reference.

Job results are stored in this form so that rows never carry image data.
"""


def stored_return_format(*, save_images: bool, return_format: str) -> str:
    """Return the ``return_format`` a stored job result should use.

    Every image that ends up on disk is stored as an output reference. Only a
    caller who asked for base64 without saving keeps the image data itself.
    """
    if return_format == "base64" and not save_images:
        return "base64"
    return REFERENCE_FORMAT


def remove_stored_images(
    images: Iterable[object], output_dir: Optional[str] = None
) -> List[str]:
    """Delete the files behind the output references in ``images``.

    Values that are not output references are ignored, as are references that
    resolve outside the output directory. Returns the removed paths.
    """
    root = resolve_output_dir(output_dir).resolve()
    removed: List[str] = []
    for value in images:
        if not isinstance(value, str):
            continue
        relative = parse_output_reference(value)
        if relative is None:
            continue
        path = (root / relative).resolve()
        if not path.is_relative_to(root):
            continue
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove generated image %s", path)
            continue
        removed.append(str(path))
    return removed


class ImageStorage:
    """Abstract interface for persisting and formatting generated images."""

    async def persist_images(
        self,
        images: Iterable[str],
        job_id: str,
        *,
        save_images: bool,
        return_format: str,
    ) -> List[str]:
        """Persist images and return processed representations."""
        raise NotImplementedError


class FileSystemImageStorage(ImageStorage):
    """Store generated images on the local filesystem."""

    def __init__(self, output_dir: Optional[str] = None) -> None:
        """Initialise the storage backend.

        Args:
            output_dir: Directory where generated images should be written.

        """
        self._output_dir = resolve_output_dir(output_dir)

    async def persist_images(
        self,
        images: Iterable[str],
        job_id: str,
        *,
        save_images: bool,
        return_format: str,
    ) -> List[str]:
        """Persist images to disk and return formatted representations.

        ``return_format`` selects what is returned for each image: the base64
        data, the absolute ``file_path``, a ``file://`` ``url``, or, for
        :data:`REFERENCE_FORMAT`, an output reference (always saved to disk).
        """
        processed: List[str] = []

        for index, img_b64 in enumerate(images):
            if return_format == "base64" and not save_images:
                processed.append(img_b64)
                continue

            needs_file = save_images or return_format in {
                "file_path",
                "url",
                REFERENCE_FORMAT,
            }
            if not needs_file:
                processed.append(img_b64)
                continue

            try:
                file_path = await self.save_image(img_b64, job_id, index)
            except Exception:  # pragma: no cover - defensive logging
                logger.exception("Error persisting image %s for job %s", index, job_id)
                raise

            if return_format == REFERENCE_FORMAT:
                relative = Path(file_path).relative_to(self._output_dir)
                processed.append(make_output_reference(relative.as_posix()))
            elif return_format == "file_path":
                processed.append(file_path)
            elif return_format == "url":
                processed.append(f"file://{file_path}")
            else:
                processed.append(img_b64)

        return processed

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        """Write a base64 image to disk and return the file path."""
        output_path = self._output_dir
        output_path.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{job_id}_{timestamp}_{index:03d}.png"
        file_path = output_path / filename

        img_data = base64.b64decode(img_b64, validate=True)
        await asyncio.to_thread(file_path.write_bytes, img_data)

        return str(file_path)
