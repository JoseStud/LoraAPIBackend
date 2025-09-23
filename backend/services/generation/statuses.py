
"""Normalization helpers for delivery and generation statuses."""


from __future__ import annotations

from enum import Enum

from typing import Dict, Optional


class GenerationStatus(Enum):
    """Canonical generation statuses exposed by the API."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


NormalizedGenerationStatus = GenerationStatus


DEFAULT_NORMALIZED_STATUS: NormalizedGenerationStatus = GenerationStatus.PROCESSING


STATUS_NORMALIZATION_MAP: Dict[str, NormalizedGenerationStatus] = {
    GenerationStatus.QUEUED.value: GenerationStatus.QUEUED,
    GenerationStatus.PROCESSING.value: GenerationStatus.PROCESSING,
    GenerationStatus.COMPLETED.value: GenerationStatus.COMPLETED,
    GenerationStatus.FAILED.value: GenerationStatus.FAILED,
    "pending": GenerationStatus.QUEUED,
    "running": GenerationStatus.PROCESSING,
    "retrying": GenerationStatus.PROCESSING,
    "starting": GenerationStatus.PROCESSING,
    "succeeded": GenerationStatus.COMPLETED,
    "failed": GenerationStatus.FAILED,
    "cancelled": GenerationStatus.FAILED,
}


def normalize_status(status: Optional[str]) -> NormalizedGenerationStatus:
    """Normalize a delivery status into a canonical API value."""

    if not status:
        return DEFAULT_NORMALIZED_STATUS

    normalized = status.lower()
    mapped = STATUS_NORMALIZATION_MAP.get(normalized)
    if mapped is not None:
        return mapped

    return DEFAULT_NORMALIZED_STATUS


__all__ = [
    "DEFAULT_NORMALIZED_STATUS",
    "GenerationStatus",
    "NormalizedGenerationStatus",
    "STATUS_NORMALIZATION_MAP",
    "normalize_status",
]
