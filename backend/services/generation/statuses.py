
"""Normalization helpers for delivery and generation statuses."""


from __future__ import annotations

from enum import Enum
from typing import Dict, Optional


class NormalizedGenerationStatus(str, Enum):
    """Canonical generation statuses exposed by the API."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


STATUS_NORMALIZATION_MAP: Dict[str, NormalizedGenerationStatus] = {
    status.value: status for status in NormalizedGenerationStatus
}
STATUS_NORMALIZATION_MAP.update(
    {
        "pending": NormalizedGenerationStatus.QUEUED,
        "running": NormalizedGenerationStatus.PROCESSING,
        "retrying": NormalizedGenerationStatus.PROCESSING,
        "starting": NormalizedGenerationStatus.PROCESSING,
        "succeeded": NormalizedGenerationStatus.COMPLETED,
        "cancelled": NormalizedGenerationStatus.FAILED,
    },
)

DEFAULT_NORMALIZED_STATUS = NormalizedGenerationStatus.PROCESSING


def normalize_status(status: Optional[str]) -> NormalizedGenerationStatus:
    """Normalize a delivery status into a canonical API value."""
    if not status:
        return DEFAULT_NORMALIZED_STATUS

    normalized = status.lower()

    mapped = STATUS_NORMALIZATION_MAP.get(normalized)
    return mapped if mapped is not None else DEFAULT_NORMALIZED_STATUS


__all__ = [
    "NormalizedGenerationStatus",
    "STATUS_NORMALIZATION_MAP",
    "normalize_status",
    "DEFAULT_NORMALIZED_STATUS",
]
