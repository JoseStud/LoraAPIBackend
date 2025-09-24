"""Streaming response helpers for generation exports."""

from __future__ import annotations

from typing import Mapping

from fastapi.responses import StreamingResponse

from backend.services.delivery_results.models import ResultArchive, ResultDownload

__all__ = ["stream_archive", "stream_download"]


def _build_headers(
    filename: str, *, size: int | None = None, extra: Mapping[str, str] | None = None
) -> dict[str, str]:
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if size is not None:
        headers["Content-Length"] = str(size)
    if extra:
        headers.update(extra)
    return headers


def stream_archive(archive: ResultArchive) -> StreamingResponse:
    """Return a streaming response for an exported archive."""
    headers = _build_headers(archive.filename, size=archive.size)
    return StreamingResponse(
        archive.iterator,
        media_type="application/zip",
        headers=headers,
    )


def stream_download(payload: ResultDownload) -> StreamingResponse:
    """Return a streaming response for a single result download."""
    headers = _build_headers(payload.filename, size=payload.size)
    return StreamingResponse(
        payload.iterator,
        media_type=payload.content_type,
        headers=headers,
    )
