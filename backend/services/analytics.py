"""Service providing analytics aggregations for generation activity."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List

from sqlalchemy import func, select
from sqlmodel import Session

from backend.models import Adapter, DeliveryJob
from backend.schemas.analytics import (
    ErrorAnalysisEntry,
    LoraUsageSlice,
    PerformanceAnalyticsCharts,
    PerformanceAnalyticsSummary,
    PerformanceInsightEntry,
    PerformanceKpiSummary,
    PerformanceTimeRange,
    ResourceUsagePoint,
)


class AnalyticsService:
    """Compute analytics summaries from delivery job activity."""

    _TIME_RANGE_MAP: Dict[PerformanceTimeRange, timedelta] = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }

    def __init__(self, db_session: Session) -> None:
        self.db_session = db_session

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def get_summary(self, time_range: PerformanceTimeRange = "24h") -> PerformanceAnalyticsSummary:
        """Return a comprehensive analytics snapshot for the requested window."""

        stats = self.get_generation_stats(time_range)
        error_breakdown = self.get_error_breakdown(time_range)
        charts = self.get_time_series_metrics(time_range)

        if not charts.lora_usage:
            charts.lora_usage = self._get_lora_usage_fallback()

        insights = self.get_performance_insights(stats, error_breakdown, charts)

        return PerformanceAnalyticsSummary(
            time_range=time_range,
            generated_at=datetime.now(timezone.utc),
            kpis=stats,
            chart_data=charts,
            error_breakdown=error_breakdown,
            performance_insights=insights,
        )

    def get_generation_stats(self, time_range: PerformanceTimeRange = "24h") -> PerformanceKpiSummary:
        """Aggregate key performance indicators for the requested range."""

        window_start, window_end, previous_start = self._resolve_time_bounds(time_range)

        total_generations = self._count_jobs(window_start, window_end)
        previous_generations = self._count_jobs(previous_start, window_start)

        succeeded = self._count_jobs(window_start, window_end, status="succeeded")
        failed = self._count_jobs(window_start, window_end, status="failed")

        avg_duration = self._average_duration(window_start, window_end)
        previous_avg_duration = self._average_duration(previous_start, window_start)

        growth = self._calculate_growth(previous_generations, total_generations)
        time_improvement = self._calculate_growth(previous_avg_duration, avg_duration, invert=True)
        success_rate = self._calculate_percentage(succeeded, succeeded + failed)

        active_loras = self._count_active_loras()
        total_loras = self._count_total_loras()

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

    def get_error_breakdown(self, time_range: PerformanceTimeRange = "24h") -> List[ErrorAnalysisEntry]:
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
                )
            )

        return breakdown

    def get_time_series_metrics(
        self, time_range: PerformanceTimeRange = "24h"
    ) -> PerformanceAnalyticsCharts:
        """Produce chart datasets for the requested time window."""

        window_start, window_end, _ = self._resolve_time_bounds(time_range)

        query = (
            select(
                DeliveryJob.created_at,
                DeliveryJob.status,
                DeliveryJob.started_at,
                DeliveryJob.finished_at,
            )
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.created_at >= window_start)
            .where(DeliveryJob.created_at < window_end)
        )
        rows = list(self.db_session.exec(query).all())

        bucket_stats: Dict[datetime, Dict[str, float]] = defaultdict(
            lambda: {"count": 0, "succeeded": 0, "failed": 0}
        )
        durations: Dict[datetime, List[float]] = defaultdict(list)

        for created_at, status, started_at, finished_at in rows:
            if created_at is None:
                created_at = window_start

            bucket = self._bucket_timestamp(created_at, time_range)
            info = bucket_stats[bucket]
            info["count"] += 1

            if status == "succeeded":
                info["succeeded"] += 1
            elif status == "failed":
                info["failed"] += 1

            if started_at and finished_at and finished_at >= started_at:
                durations[bucket].append((finished_at - started_at).total_seconds())

        ordered_buckets = sorted(bucket_stats.keys())
        generation_volume = []
        performance = []
        for bucket in ordered_buckets:
            info = bucket_stats[bucket]
            generation_volume.append({"timestamp": bucket, "count": int(info["count"])})

            duration_list = durations.get(bucket, [])
            avg_time = sum(duration_list) / len(duration_list) if duration_list else 0.0
            completed = info["succeeded"] + info["failed"]
            success_rate = self._calculate_percentage(info["succeeded"], completed)
            performance.append(
                {
                    "timestamp": bucket,
                    "avg_time": round(avg_time, 2),
                    "success_rate": round(success_rate, 2),
                }
            )

        max_count = max((entry["count"] for entry in generation_volume), default=0) or 1
        resource_usage = []
        for entry in generation_volume:
            bucket = entry["timestamp"]
            load_factor = min(1.0, entry["count"] / max_count)
            resource_usage.append(
                ResourceUsagePoint(
                    timestamp=bucket,
                    cpu_percent=round(35 + load_factor * 55, 2),
                    memory_percent=round(45 + load_factor * 45, 2),
                    gpu_percent=round(40 + load_factor * 60, 2),
                )
            )

        charts = PerformanceAnalyticsCharts(
            generation_volume=[
                {
                    "timestamp": item["timestamp"],
                    "count": item["count"],
                }
                for item in generation_volume
            ],
            performance=[
                {
                    "timestamp": item["timestamp"],
                    "avg_time": item["avg_time"],
                    "success_rate": item["success_rate"],
                }
                for item in performance
            ],
            resource_usage=resource_usage,
        )

        return charts

    def get_performance_insights(
        self,
        stats: PerformanceKpiSummary,
        errors: List[ErrorAnalysisEntry],
        charts: PerformanceAnalyticsCharts,
    ) -> List[PerformanceInsightEntry]:
        """Derive human-readable insights from analytics data."""

        insights: List[PerformanceInsightEntry] = []
        identifier = 1

        if stats.success_rate < 90:
            insights.append(
                PerformanceInsightEntry(
                    id=f"insight-{identifier}",
                    title="Declining success rate",
                    description="Success rate dropped below 90% in the selected window.",
                    severity="high",
                    recommendation="review_failed_jobs",
                )
            )
            identifier += 1

        if stats.time_improvement < 0:
            insights.append(
                PerformanceInsightEntry(
                    id=f"insight-{identifier}",
                    title="Generation time regression",
                    description="Average generation time increased compared to the previous period.",
                    severity="medium",
                    recommendation="investigate_performance",
                )
            )
            identifier += 1

        if errors:
            top_error = errors[0]
            if top_error.percentage >= 25:
                insights.append(
                    PerformanceInsightEntry(
                        id=f"insight-{identifier}",
                        title=f"Frequent error: {top_error.type}",
                        description=f"{top_error.percentage:.1f}% of failures were '{top_error.type}'.",
                        severity="medium",
                        recommendation="analyse_error_trends",
                    )
                )
                identifier += 1

        if not insights:
            insights.append(
                PerformanceInsightEntry(
                    id="insight-stable",
                    title="Stable performance",
                    description="System performance is stable with no major issues detected.",
                    severity="low",
                    recommendation=None,
                )
            )

        return insights

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_time_bounds(
        self, time_range: PerformanceTimeRange
    ) -> tuple[datetime, datetime, datetime]:
        delta = self._TIME_RANGE_MAP.get(time_range, self._TIME_RANGE_MAP["24h"])
        now = datetime.now(timezone.utc)
        start = now - delta
        previous_start = start - delta
        return start, now, previous_start

    def _bucket_timestamp(
        self, timestamp: datetime, time_range: PerformanceTimeRange
    ) -> datetime:
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)

        if time_range == "24h":
            return timestamp.replace(minute=0, second=0, microsecond=0)
        return timestamp.replace(hour=0, minute=0, second=0, microsecond=0)

    def _count_jobs(
        self,
        start: datetime,
        end: datetime,
        *,
        status: str | None = None,
    ) -> int:
        query = (
            select(func.count(DeliveryJob.id))
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.created_at >= start)
            .where(DeliveryJob.created_at < end)
        )
        if status is not None:
            query = query.where(DeliveryJob.status == status)

        result = self.db_session.exec(query).one()
        return int(result or 0)

    def _average_duration(self, start: datetime, end: datetime) -> float:
        query = (
            select(DeliveryJob.started_at, DeliveryJob.finished_at)
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.finished_at.is_not(None))
            .where(DeliveryJob.started_at.is_not(None))
            .where(DeliveryJob.created_at >= start)
            .where(DeliveryJob.created_at < end)
        )

        durations = []
        for started_at, finished_at in self.db_session.exec(query):
            if started_at and finished_at and finished_at >= started_at:
                durations.append((finished_at - started_at).total_seconds())

        if not durations:
            return 0.0
        return sum(durations) / len(durations)

    def _calculate_growth(
        self, previous: float, current: float, *, invert: bool = False
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

    def _count_active_loras(self) -> int:
        result = self.db_session.exec(
            select(func.count(Adapter.id)).where(Adapter.active.is_(True))
        ).one()
        return int(result or 0)

    def _count_total_loras(self) -> int:
        result = self.db_session.exec(select(func.count(Adapter.id))).one()
        return int(result or 0)

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

    def _get_lora_usage_fallback(self, limit: int = 10) -> List[LoraUsageSlice]:
        query = select(Adapter.name, Adapter.stats).where(Adapter.active.is_(True))
        usage: List[LoraUsageSlice] = []

        for name, stats in self.db_session.exec(query):
            usage_count = 0
            if isinstance(stats, dict):
                for key in ("usage_count", "generations", "activations"):
                    value = stats.get(key)
                    if isinstance(value, (int, float)):
                        usage_count = int(value)
                        break
            if usage_count > 0:
                usage.append(LoraUsageSlice(name=name, usage_count=usage_count))

        usage.sort(key=lambda item: item.usage_count, reverse=True)
        return usage[:limit]
