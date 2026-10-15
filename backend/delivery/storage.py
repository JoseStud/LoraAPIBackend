"""Storage abstractions for generation outputs."""

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional

from backend.utils.images import make_output_reference, resolve_output_dir

logger = logging.getLogger(__name__)

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
