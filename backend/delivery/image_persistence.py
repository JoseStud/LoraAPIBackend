"""Helpers for persisting images produced by delivery backends."""

from __future__ import annotations

import logging
from typing import Iterable, List, Optional

from backend.core.config import settings

from .storage import FileSystemImageStorage, ImageStorage

logger = logging.getLogger(__name__)


class ImagePersistence:
    """Handle persistence and formatting of generated images."""

    def __init__(self, storage: Optional[ImageStorage] = None) -> None:
        self._storage = storage or FileSystemImageStorage(settings.SDNEXT_OUTPUT_DIR)

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
            try:
                if return_format == "base64":
                    processed.append(img_b64)
                elif return_format == "file_path" or save_images:
                    file_path = await self._storage.save_image(img_b64, job_id, index)
                    if return_format == "file_path":
                        processed.append(file_path)
                    else:
                        processed.append(img_b64)
                elif return_format == "url":
                    file_path = await self._storage.save_image(img_b64, job_id, index)
                    processed.append(f"file://{file_path}")
                else:
                    processed.append(img_b64)
            except Exception:  # pragma: no cover - defensive logging
                logger.exception("Error persisting image %s for job %s", index, job_id)
                continue

        return processed
