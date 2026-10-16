"""The one progress scale the API speaks: a fraction in ``[0, 1]``.

Every ``progress`` value the API emits (REST queue and job responses, the
progress WebSocket, ``/generation/progress``) is a fraction where ``1.0``
means complete. SD.Next's ``/sdapi/v1/progress`` already reports a fraction.
Values above 1 are only expected from job results stored before the scale
was fixed, which held percentages; they are read as percentages here so a
legacy ``50`` becomes ``0.5``. A value of exactly 1 is always the fraction
``1.0`` (complete), never 1 %.

Normalize with :func:`to_progress_fraction` wherever a progress value enters
the API from storage or a generation backend, rather than with a local
heuristic.
"""

from __future__ import annotations

import math
from typing import Any, Optional

__all__ = ["PROGRESS_DESCRIPTION", "to_progress_fraction"]

PROGRESS_DESCRIPTION = "Progress as a fraction from 0.0 to 1.0 (1.0 is complete)."
"""OpenAPI description shared by every ``progress`` schema field."""


def to_progress_fraction(value: Any) -> Optional[float]:
    """Return ``value`` as a progress fraction in ``[0, 1]``.

    ``None``, booleans and anything that is not a finite number yield
    ``None``. Values above 1 are legacy percentages and are divided by 100;
    the result is clamped to ``[0, 1]``.
    """
    if value is None or isinstance(value, bool):
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(number):
        return None

    if number > 1.0:
        number /= 100.0
    return min(max(number, 0.0), 1.0)
