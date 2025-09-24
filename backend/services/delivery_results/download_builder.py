"""Helpers that prepare download payloads for delivery results."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Optional

from backend.models import DeliveryJob

from .asset_resolver import ResultAssetResolver
from .models import ResultDownload

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from ..generation import GenerationCoordinator
    from ..storage import StorageService


class ResultDownloadBuilder:
    """Prepare download metadata for a result's primary asset."""

    def __init__(self, asset_resolver: ResultAssetResolver) -> None:
        self._assets = asset_resolver

    def build(
        self,
        job: DeliveryJob,
        *,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        chunk_size: int = 64 * 1024,
    ) -> Optional[ResultDownload]:
        """Prepare a download payload for the primary asset of ``job``."""
        assets = self._assets.collect(job, storage, coordinator=coordinator)
        if not assets:
            return None

        primary = assets[0]
        if primary.path:
            path = Path(primary.path)
            if not storage.validate_file_path(primary.path):
                return None

            size: Optional[int] = primary.size
            if size is None:
                try:
                    size = path.stat().st_size
                except OSError:
                    size = None

            return ResultDownload(
                filename=primary.filename,
                content_type=primary.content_type,
                iterator=self._stream_path(path, chunk_size),
                size=size,
            )

        if primary.data is not None:
            data = primary.data
            return ResultDownload(
                filename=primary.filename,
                content_type=primary.content_type,
                iterator=self._stream_bytes(data),
                size=len(data),
            )

        return None

    def _stream_path(self, path: Path, chunk_size: int) -> Iterable[bytes]:
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def _stream_bytes(self, data: bytes) -> Iterable[bytes]:
        yield data


__all__ = ["ResultDownloadBuilder"]
