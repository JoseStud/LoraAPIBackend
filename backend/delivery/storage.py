"""Storage abstractions for generation outputs."""

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional

logger = logging.getLogger(__name__)


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
        self._output_dir = (
            Path(output_dir)
            if output_dir
            else Path.cwd() / "generated_images"
        )

    async def persist_images(
        self,
        images: Iterable[str],
        job_id: str,
        *,
        save_images: bool,
        return_format: str,
    ) -> List[str]:
        processed: List[str] = []

        for index, img_b64 in enumerate(images):
            if return_format == "base64" and not save_images:
                processed.append(img_b64)
                continue

            needs_file = save_images or return_format in {"file_path", "url"}
            if not needs_file:
                processed.append(img_b64)
                continue

            try:
                file_path = await self.save_image(img_b64, job_id, index)
            except Exception:  # pragma: no cover - defensive logging
                logger.exception("Error persisting image %s for job %s", index, job_id)
                continue

            if return_format == "file_path":
                processed.append(file_path)
            elif return_format == "url":
                processed.append(f"file://{file_path}")
            else:
                processed.append(img_b64)

        return processed

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        output_path = self._output_dir
        output_path.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{job_id}_{timestamp}_{index:03d}.png"
        file_path = output_path / filename

        img_data = base64.b64decode(img_b64)
        await asyncio.to_thread(file_path.write_bytes, img_data)

        return str(file_path)
