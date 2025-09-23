"""Unit tests for analytics helper utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.schemas.analytics import (
    ErrorAnalysisEntry,
    PerformanceAnalyticsCharts,
    PerformanceInsightEntry,
    PerformanceKpiSummary,
)
from backend.services.analytics import InsightGenerator, TimeSeriesBuilder


def test_time_series_builder_groups_rows_by_bucket() -> None:
    builder = TimeSeriesBuilder()
    window_start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    rows = [
        (window_start, "succeeded", window_start, window_start + timedelta(seconds=10)),
        (
            window_start + timedelta(minutes=45),
            "failed",
            window_start,
            window_start + timedelta(seconds=20),
        ),
        (None, "succeeded", None, None),
    ]

    charts = builder.build(rows, "24h", window_start)

    assert len(charts.generation_volume) == 1
    assert charts.generation_volume[0].count == 3
    assert charts.performance[0].success_rate == 66.67
    assert charts.performance[0].avg_time == 15.0
    assert charts.resource_usage[0].cpu_percent == 90.0


def test_insight_generator_produces_expected_flags() -> None:
    generator = InsightGenerator()
    stats = PerformanceKpiSummary(success_rate=80, time_improvement=-5)
    errors = [
        ErrorAnalysisEntry(type="Timeout", count=5, percentage=30.0, description="Timeout"),
    ]
    charts = PerformanceAnalyticsCharts()

    insights = generator.generate(stats, errors, charts)

    titles = {insight.title for insight in insights}
    assert "Declining success rate" in titles
    assert "Generation time regression" in titles
    assert any("Frequent error" in title for title in titles)


def test_insight_generator_reports_stable_when_no_flags() -> None:
    generator = InsightGenerator()
    stats = PerformanceKpiSummary(success_rate=95, time_improvement=2)
    charts = PerformanceAnalyticsCharts()

    insights = generator.generate(stats, [], charts)

    assert insights == [
        PerformanceInsightEntry(
            id="insight-stable",
            title="Stable performance",
            description="System performance is stable with no major issues detected.",
            severity="low",
            recommendation=None,
        ),
    ]
