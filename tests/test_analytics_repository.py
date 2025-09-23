"""Tests for AnalyticsRepository data access helpers."""

from datetime import datetime, timedelta, timezone

import pytest

from backend.models import DeliveryJob
from backend.services.analytics_repository import AnalyticsRepository


def test_average_duration_returns_zero_without_matching_jobs(db_session):
    """Empty windows should return a duration of zero seconds."""

    repository = AnalyticsRepository(db_session)
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    assert repository.average_duration(start, end) == 0.0


def test_average_duration_aggregates_in_database(db_session):
    """The average duration is computed via SQL aggregation for qualifying jobs."""

    repository = AnalyticsRepository(db_session)
    window_start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    window_end = window_start + timedelta(days=1)

    qualifying_one = DeliveryJob(
        prompt="Prompt A",
        mode="sdnext",
        status="succeeded",
        created_at=window_start + timedelta(hours=1),
        started_at=window_start + timedelta(hours=1, seconds=2),
        finished_at=window_start + timedelta(hours=1, seconds=7),
    )
    qualifying_two = DeliveryJob(
        prompt="Prompt B",
        mode="sdnext",
        status="succeeded",
        created_at=window_start + timedelta(hours=2),
        started_at=window_start + timedelta(hours=2, seconds=10),
        finished_at=window_start + timedelta(hours=2, seconds=22),
    )

    # Jobs that should not affect the average
    non_sdnext = DeliveryJob(
        prompt="Prompt C",
        mode="other",
        status="succeeded",
        created_at=window_start + timedelta(hours=3),
        started_at=window_start + timedelta(hours=3, seconds=5),
        finished_at=window_start + timedelta(hours=3, seconds=30),
    )
    unfinished = DeliveryJob(
        prompt="Prompt D",
        mode="sdnext",
        status="running",
        created_at=window_start + timedelta(hours=4),
        started_at=window_start + timedelta(hours=4, seconds=5),
        finished_at=None,
    )
    outside_window = DeliveryJob(
        prompt="Prompt E",
        mode="sdnext",
        status="succeeded",
        created_at=window_start - timedelta(seconds=1),
        started_at=window_start - timedelta(seconds=1),
        finished_at=window_start + timedelta(seconds=4),
    )

    db_session.add_all(
        [
            qualifying_one,
            qualifying_two,
            non_sdnext,
            unfinished,
            outside_window,
        ]
    )
    db_session.commit()

    expected_average = (5 + 12) / 2
    assert repository.average_duration(window_start, window_end) == pytest.approx(
        expected_average
    )
