"""Service providing analytics aggregations for generation activity."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List

from sqlalchemy import select
from sqlmodel import Session

from backend.models import DeliveryJob
from backend.schemas.analytics import (
    ErrorAnalysisEntry,
    LoraUsageSlice,
    PerformanceAnalyticsCharts,
    PerformanceAnalyticsSummary,
    PerformanceInsightEntry,
    PerformanceKpiSummary,
    PerformanceTimeRange,
)

from ..analytics_repository import AnalyticsRepository
from .insights import InsightGenerator
from .time_series import TimeSeriesBuilder


class AnalyticsService:
    """Compute analytics summaries from delivery job activity."""

    _TIME_RANGE_MAP: Dict[PerformanceTimeRange, timedelta] = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }

    def __init__(
        self,
        db_session: Session,
        *,
        repository: AnalyticsRepository | None = None,
        time_series_builder: TimeSeriesBuilder | None = None,
        insight_generator: InsightGenerator | None = None,
    ) -> None:
        """Initialise analytics helpers with optional overrides."""
        self.db_session = db_session
        self.repository = repository or AnalyticsRepository(db_session)
        self.time_series_builder = time_series_builder or TimeSeriesBuilder()
        self.insight_generator = insight_generator or InsightGenerator()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def get_summary(
        self, time_range: PerformanceTimeRange = "24h"
    ) -> PerformanceAnalyticsSummary:
        """Return a comprehensive analytics snapshot for the requested window."""
        stats = self.get_generation_stats(time_range)
        error_breakdown = self.get_error_breakdown(time_range)
        charts = self.get_time_series_metrics(time_range)

        if not charts.lora_usage:
            charts.lora_usage = self._build_lora_usage_fallback()

        insights = self.get_performance_insights(stats, error_breakdown, charts)

        return PerformanceAnalyticsSummary(
            time_range=time_range,
            generated_at=datetime.now(timezone.utc),
            kpis=stats,
            chart_data=charts,
            error_breakdown=error_breakdown,
            performance_insights=insights,
        )

    def get_generation_stats(
        self, time_range: PerformanceTimeRange = "24h"
    ) -> PerformanceKpiSummary:
        """Aggregate key performance indicators for the requested range."""
        window_start, window_end, previous_start = self._resolve_time_bounds(time_range)

        total_generations = self.repository.count_jobs(window_start, window_end)
        previous_generations = self.repository.count_jobs(previous_start, window_start)

        succeeded = self.repository.count_jobs(
            window_start,
            window_end,
            status="succeeded",
        )
        failed = self.repository.count_jobs(window_start, window_end, status="failed")

        avg_duration = self.repository.average_duration(window_start, window_end)
        previous_avg_duration = self.repository.average_duration(
            previous_start,
            window_start,
        )

        growth = self._calculate_growth(previous_generations, total_generations)
        time_improvement = self._calculate_growth(
            previous_avg_duration, avg_duration, invert=True
        )
        success_rate = self._calculate_percentage(succeeded, succeeded + failed)

        active_loras = self.repository.count_active_loras()
        total_loras = self.repository.count_total_loras()

        return PerformanceKpiSummary(
            total_generations=total_generations,
            generation_growth=round(growth, 2),
            avg_generation_time=round(avg_duration, 2),
            time_improvement=round(time_improvement, 2),
            success_rate=round(success_rate, 2),
            total_failed=failed,
            active_loras=active_loras,
            total_loras=total_loras,
        )

    def get_error_breakdown(
        self, time_range: PerformanceTimeRange = "24h"
    ) -> List[ErrorAnalysisEntry]:
        """Return error distribution for failed jobs in the selected window."""
        window_start, window_end, _ = self._resolve_time_bounds(time_range)

        query = (
            select(DeliveryJob.result)
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.created_at >= window_start)
            .where(DeliveryJob.created_at < window_end)
            .where(DeliveryJob.status == "failed")
        )
        rows: Iterable[str | None] = (row[0] for row in self.db_session.exec(query))

        counter: Counter[str] = Counter()
        descriptions: Dict[str, str] = {}

        for payload in rows:
            message = self._extract_error_message(payload)
            counter[message] += 1
            descriptions.setdefault(message, message)

        total = sum(counter.values())
        breakdown: List[ErrorAnalysisEntry] = []
        for error_type, count in counter.most_common():
            percentage = self._calculate_percentage(count, total)
            breakdown.append(
                ErrorAnalysisEntry(
                    type=error_type,
                    count=count,
                    percentage=round(percentage, 2),
                    description=descriptions.get(error_type, error_type),
                ),
            )

        return breakdown

    def get_time_series_metrics(
        self,
        time_range: PerformanceTimeRange = "24h",
    ) -> PerformanceAnalyticsCharts:
        """Produce chart datasets for the requested time window."""
        window_start, window_end, _ = self._resolve_time_bounds(time_range)

        rows = self.repository.fetch_time_series_rows(window_start, window_end)
        return self.time_series_builder.build(rows, time_range, window_start)

    def get_performance_insights(
        self,
        stats: PerformanceKpiSummary,
        errors: List[ErrorAnalysisEntry],
        charts: PerformanceAnalyticsCharts,
    ) -> List[PerformanceInsightEntry]:
        """Derive human-readable insights from analytics data."""
        return self.insight_generator.generate(stats, errors, charts)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_time_bounds(
        self,
        time_range: PerformanceTimeRange,
    ) -> tuple[datetime, datetime, datetime]:
        delta = self._TIME_RANGE_MAP.get(time_range, self._TIME_RANGE_MAP["24h"])
        now = datetime.now(timezone.utc)
        start = now - delta
        previous_start = start - delta
        return start, now, previous_start

    def _calculate_growth(
        self,
        previous: float,
        current: float,
        *,
        invert: bool = False,
    ) -> float:
        if previous <= 0:
            return 0.0

        delta = current - previous
        ratio = delta / previous
        if invert:
            # Positive values indicate improvement (reduced duration)
            ratio = -ratio
        return ratio * 100

    def _calculate_percentage(self, value: float, total: float) -> float:
        if total <= 0:
            return 0.0
        return (value / total) * 100

    def _extract_error_message(self, payload: str | None) -> str:
        if not payload:
            return "Unknown error"

        message = payload
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            data = None

        if isinstance(data, dict):
            for key in ("error", "message", "detail", "reason"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    message = value
                    break
        elif isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, str) and first.strip():
                message = first

        message = str(message).strip() or "Unknown error"
        return message

    def _build_lora_usage_fallback(self, limit: int = 10) -> List[LoraUsageSlice]:
        usage_pairs = self.repository.active_lora_usage_counts()
        return [
            LoraUsageSlice(name=name, usage_count=count)
            for name, count in usage_pairs[:limit]
        ]
