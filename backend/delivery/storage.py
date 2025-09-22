"""Storage abstractions for generation outputs."""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class ImageStorage:
    """Abstract interface for persisting generated images."""

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        """Persist a base64-encoded image and return its location."""
        raise NotImplementedError


class FileSystemImageStorage(ImageStorage):
    """Store generated images on the local filesystem."""

    def __init__(self, output_dir: Optional[str] = None) -> None:
        self._output_dir = Path(output_dir) if output_dir else Path.cwd() / "generated_images"

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        output_path = self._output_dir
        output_path.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{job_id}_{timestamp}_{index:03d}.png"
        file_path = output_path / filename

        img_data = base64.b64decode(img_b64)
        await asyncio.to_thread(file_path.write_bytes, img_data)

        return str(file_path)
