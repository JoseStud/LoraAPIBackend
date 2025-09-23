"""Shared normalization logic for generation job statuses."""

from __future__ import annotations

from enum import Enum
from typing import Dict, Iterable, Optional


class NormalizedGenerationStatus(str, Enum):
    """Enumerates the statuses exposed to the frontend."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


DEFAULT_NORMALIZED_STATUS: NormalizedGenerationStatus = NormalizedGenerationStatus.PROCESSING


_CANONICAL_STATUS_MAP: Dict[str, NormalizedGenerationStatus] = {
    status.value: status for status in NormalizedGenerationStatus
}


#: Status values received from the delivery backend that should be
#: normalized before being exposed to the UI.
DELIVERY_STATUS_ALIASES: Dict[str, NormalizedGenerationStatus] = {
    "pending": NormalizedGenerationStatus.QUEUED,
    "running": NormalizedGenerationStatus.PROCESSING,
    "retrying": NormalizedGenerationStatus.PROCESSING,
    "starting": NormalizedGenerationStatus.PROCESSING,
    "succeeded": NormalizedGenerationStatus.COMPLETED,
    "completed": NormalizedGenerationStatus.COMPLETED,
    "failed": NormalizedGenerationStatus.FAILED,
    "cancelled": NormalizedGenerationStatus.FAILED,
}


STATUS_NORMALIZATION_MAP: Dict[str, NormalizedGenerationStatus] = {
    **_CANONICAL_STATUS_MAP,
    **DELIVERY_STATUS_ALIASES,
}

NORMALIZED_STATUS_VALUES = frozenset(_CANONICAL_STATUS_MAP)


def iter_normalized_status_values() -> Iterable[str]:
    """Return an iterable over the canonical normalized status values."""

    return NORMALIZED_STATUS_VALUES


def normalize_status(status: Optional[str]) -> NormalizedGenerationStatus:
    """Normalize a status string into one of the canonical values."""

    if not status:
        return DEFAULT_NORMALIZED_STATUS

    normalized_key = status.lower()
    return STATUS_NORMALIZATION_MAP.get(normalized_key, DEFAULT_NORMALIZED_STATUS)


__all__ = [
    "DEFAULT_NORMALIZED_STATUS",
    "DELIVERY_STATUS_ALIASES",
    "NormalizedGenerationStatus",
    "NORMALIZED_STATUS_VALUES",
    "STATUS_NORMALIZATION_MAP",
    "iter_normalized_status_values",
    "normalize_status",
]
