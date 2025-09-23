"""Formatting helpers for presenting human-readable values."""

from __future__ import annotations

import math

__all__ = ["format_bytes", "format_duration"]


def format_bytes(num_bytes: int) -> str:
    """Return a human-readable representation of a byte count."""
    if num_bytes <= 0:
        return "0 Bytes"

    units = ["Bytes", "KB", "MB", "GB", "TB", "PB"]
    value = float(num_bytes)
    exponent = 0
    while value >= 1024 and exponent < len(units) - 1:
        value /= 1024
        exponent += 1

    if exponent == 0:
        return f"{int(value)} {units[exponent]}"
    return f"{value:.2f} {units[exponent]}"


def format_duration(seconds: float) -> str:
    """Render a duration in seconds into a user-friendly string."""
    if seconds <= 0:
        return "0 seconds"
    if seconds < 60:
        return f"{max(1, math.ceil(seconds))} seconds"
    minutes = math.ceil(seconds / 60)
    return f"{minutes} minutes"

