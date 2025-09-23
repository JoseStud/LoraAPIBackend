import pytest

from backend.services.generation import normalize_generation_status
from backend.services.generation.statuses import (
    DEFAULT_NORMALIZED_STATUS,
    STATUS_NORMALIZATION_MAP,
    NormalizedGenerationStatus,
)

EXPECTED_NORMALIZED_VALUES = {
    "queued",
    "processing",
    "completed",
    "failed",
}


def test_normalized_status_enum_values_are_expected() -> None:
    assert {status.value for status in NormalizedGenerationStatus} == EXPECTED_NORMALIZED_VALUES


@pytest.mark.parametrize(
    ("input_status", "expected"),
    [
        (None, DEFAULT_NORMALIZED_STATUS.value),
        ("", DEFAULT_NORMALIZED_STATUS.value),
        ("queued", "queued"),
        ("pending", "queued"),
        ("processing", "processing"),
        ("running", "processing"),
        ("completed", "completed"),
        ("succeeded", "completed"),
        ("failed", "failed"),
        ("cancelled", "failed"),
        ("UNKNOWN", DEFAULT_NORMALIZED_STATUS.value),
    ],
)
def test_normalize_generation_status_matches_expected_values(
    input_status: str | None, expected: str,
) -> None:
    assert normalize_generation_status(input_status) == expected


def test_status_normalization_map_includes_all_expected_keys() -> None:
    assert set(STATUS_NORMALIZATION_MAP) == {
        "queued",
        "processing",
        "completed",
        "failed",
        "pending",
        "running",
        "retrying",
        "starting",
        "succeeded",
        "cancelled",
    }
