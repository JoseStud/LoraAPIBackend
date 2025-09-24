"""Helpers for persisting images produced by delivery backends."""

from __future__ import annotations

import logging
from typing import Iterable, List, Optional, cast

from backend.core.config import settings

from .storage import FileSystemImageStorage, ImageStorage

logger = logging.getLogger(__name__)


class ImagePersistence:
    """Handle persistence and formatting of generated images."""

    def __init__(self, storage: Optional[ImageStorage] = None) -> None:
        """Initialise the persistence helper.

        Args:
            storage: Storage backend used to persist generated images.

        """
        self._storage = storage or FileSystemImageStorage(settings.SDNEXT_OUTPUT_DIR)

    async def persist_images(
        self,
        images: Iterable[str],
        job_id: str,
        *,
        save_images: bool,
        return_format: str,
    ) -> List[str]:
        """Persist images and return data matching the requested format."""
        if hasattr(self._storage, "persist_images"):
            storage = cast(ImageStorage, self._storage)
            return await storage.persist_images(
                images,
                job_id,
                save_images=save_images,
                return_format=return_format,
            )

        processed: List[str] = []

        for index, img_b64 in enumerate(images):
            try:
                if return_format == "base64" and not save_images:
                    processed.append(img_b64)
                    continue

                file_path = await self._storage.save_image(img_b64, job_id, index)

                if return_format == "file_path":
                    processed.append(file_path)
                elif return_format == "url":
                    processed.append(f"file://{file_path}")
                else:
                    processed.append(img_b64)
            except Exception:  # pragma: no cover - defensive logging
                logger.exception("Error persisting image %s for job %s", index, job_id)
                continue

        return processed
