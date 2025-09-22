"""Unit tests for the image persistence helper."""

from __future__ import annotations

import pytest

from backend.delivery.image_persistence import ImagePersistence


class FakeStorage:
    def __init__(self, raise_indices: set[int] | None = None) -> None:
        self.calls: list[tuple[str, str, int]] = []
        self.raise_indices = raise_indices or set()

    async def save_image(self, img_b64: str, job_id: str, index: int) -> str:
        self.calls.append((img_b64, job_id, index))
        if index in self.raise_indices:
            raise RuntimeError("boom")
        return f"saved-{job_id}-{index}"


@pytest.mark.anyio("asyncio")
async def test_base64_format_skips_storage() -> None:
    storage = FakeStorage()
    persistence = ImagePersistence(storage)

    result = await persistence.persist_images(
        ["aGVsbG8="],
        "job-1",
        save_images=False,
        return_format="base64",
    )

    assert result == ["aGVsbG8="]
    assert storage.calls == []


@pytest.mark.anyio("asyncio")
async def test_file_path_format_returns_paths() -> None:
    storage = FakeStorage()
    persistence = ImagePersistence(storage)

    result = await persistence.persist_images(
        ["aGVsbG8="],
        "job-2",
        save_images=False,
        return_format="file_path",
    )

    assert result == ["saved-job-2-0"]
    assert storage.calls == [("aGVsbG8=", "job-2", 0)]


@pytest.mark.anyio("asyncio")
async def test_url_format_returns_file_urls() -> None:
    storage = FakeStorage()
    persistence = ImagePersistence(storage)

    result = await persistence.persist_images(
        ["aGVsbG8="],
        "job-3",
        save_images=False,
        return_format="url",
    )

    assert result == ["file://saved-job-3-0"]
    assert storage.calls == [("aGVsbG8=", "job-3", 0)]


@pytest.mark.anyio("asyncio")
async def test_save_images_true_preserves_base64() -> None:
    storage = FakeStorage()
    persistence = ImagePersistence(storage)

    result = await persistence.persist_images(
        ["aGVsbG8="],
        "job-4",
        save_images=True,
        return_format="json",
    )

    assert result == ["aGVsbG8="]
    assert storage.calls == [("aGVsbG8=", "job-4", 0)]


@pytest.mark.anyio("asyncio")
async def test_storage_error_is_swallowed() -> None:
    storage = FakeStorage(raise_indices={0})
    persistence = ImagePersistence(storage)

    result = await persistence.persist_images(
        ["img1", "img2"],
        "job-5",
        save_images=False,
        return_format="file_path",
    )

    assert result == ["saved-job-5-1"]
    assert storage.calls == [
        ("img1", "job-5", 0),
        ("img2", "job-5", 1),
    ]
