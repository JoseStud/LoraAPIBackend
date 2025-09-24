"""Heuristics for deriving analytics insights."""

from __future__ import annotations

from typing import List

from backend.schemas.analytics import (
    ErrorAnalysisEntry,
    PerformanceAnalyticsCharts,
    PerformanceInsightEntry,
    PerformanceKpiSummary,
)


class InsightGenerator:
    """Generate human-readable insights from analytics data."""

    def generate(
        self,
        stats: PerformanceKpiSummary,
        errors: List[ErrorAnalysisEntry],
        charts: PerformanceAnalyticsCharts,
    ) -> List[PerformanceInsightEntry]:
        """Return narrative insights derived from analytics data."""
        del charts  # Currently unused but reserved for future heuristics

        insights: List[PerformanceInsightEntry] = []
        identifier = 1

        if stats.success_rate < 90:
            insights.append(
                PerformanceInsightEntry(
                    id=f"insight-{identifier}",
                    title="Declining success rate",
                    description=(
                        "Success rate dropped below 90% in the selected window."
                    ),
                    severity="high",
                    recommendation="review_failed_jobs",
                ),
            )
            identifier += 1

        if stats.time_improvement < 0:
            insights.append(
                PerformanceInsightEntry(
                    id=f"insight-{identifier}",
                    title="Generation time regression",
                    description=(
                        "Average generation time increased compared to the "
                        "previous period."
                    ),
                    severity="medium",
                    recommendation="investigate_performance",
                ),
            )
            identifier += 1

        if errors:
            top_error = errors[0]
            if top_error.percentage >= 25:
                insights.append(
                    PerformanceInsightEntry(
                        id=f"insight-{identifier}",
                        title=f"Frequent error: {top_error.type}",
                        description=(
                            f"{top_error.percentage:.1f}% of failures were "
                            f"'{top_error.type}'."
                        ),
                        severity="medium",
                        recommendation="analyse_error_trends",
                    ),
                )
                identifier += 1

        if not insights:
            insights.append(
                PerformanceInsightEntry(
                    id="insight-stable",
                    title="Stable performance",
                    description=(
                        "System performance is stable with no major issues detected."
                    ),
                    severity="low",
                    recommendation=None,
                ),
            )

        return insights
