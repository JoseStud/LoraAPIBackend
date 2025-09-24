"""Data models used by delivery result helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, Optional


@dataclass
class ResultAsset:
    """Representation of a persisted generation asset."""

    filename: str
    content_type: str
    path: Optional[str] = None
    data: Optional[bytes] = None
    size: Optional[int] = None

    def iter_bytes(self, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        """Yield file content as chunks or a single in-memory blob."""

        if self.path:
            path = Path(self.path)
            with path.open("rb") as stream:
                while True:
                    chunk = stream.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            return

        if self.data is not None:
            yield self.data


@dataclass
class ResultArchive:
    """Streaming archive payload for exported generation results."""

    iterator: Iterable[bytes]
    manifest: Dict[str, Any]
    size: int
    filename: str


@dataclass
class ResultDownload:
    """Metadata describing a downloadable generation artifact."""

    filename: str
    content_type: str
    iterator: Iterable[bytes]
    size: Optional[int] = None


__all__ = [
    "ResultArchive",
    "ResultAsset",
    "ResultDownload",
]
