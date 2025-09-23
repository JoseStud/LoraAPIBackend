
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


_VALUE_TO_STATUS: Dict[str, GenerationStatus] = {
    status.value: status for status in GenerationStatus
}

_DELIVERY_TO_STATUS: Dict[str, GenerationStatus] = {
    "pending": GenerationStatus.QUEUED,
    "running": GenerationStatus.PROCESSING,
    "retrying": GenerationStatus.PROCESSING,
    "succeeded": GenerationStatus.COMPLETED,
    "failed": GenerationStatus.FAILED,
    "cancelled": GenerationStatus.FAILED,
}


def normalize_status(status: Optional[str]) -> GenerationStatus:
    """Normalize a delivery status into a canonical API value."""

    if not status:
        return GenerationStatus.PROCESSING

    normalized = status.lower()

    mapped = _DELIVERY_TO_STATUS.get(normalized)
    if mapped is not None:
        return mapped

    existing = _VALUE_TO_STATUS.get(normalized)
    if existing is not None:
        return existing

    return GenerationStatus.PROCESSING


__all__ = ["GenerationStatus", "normalize_status"]
