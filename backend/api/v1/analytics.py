"""Analytics API endpoints exposing performance metrics."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query

from backend.core.dependencies import get_service_container
from backend.schemas.analytics import (
    ErrorAnalysisEntry,
    PerformanceAnalyticsCharts,
    PerformanceAnalyticsSummary,
    PerformanceInsightEntry,
    PerformanceKpiSummary,
    PerformanceTimeRange,
)
from backend.services import ServiceRegistry


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=PerformanceAnalyticsSummary)
def get_analytics_summary(
    time_range: PerformanceTimeRange = Query("24h"),
    services: ServiceRegistry = Depends(get_service_container),
) -> PerformanceAnalyticsSummary:
    """Return a comprehensive analytics snapshot for the requested range."""

    return services.analytics.get_summary(time_range)


@router.get("/stats", response_model=PerformanceKpiSummary)
def get_generation_stats(
    time_range: PerformanceTimeRange = Query("24h"),
    services: ServiceRegistry = Depends(get_service_container),
) -> PerformanceKpiSummary:
    """Expose headline generation KPIs for the requested range."""

    return services.analytics.get_generation_stats(time_range)


@router.get("/errors", response_model=List[ErrorAnalysisEntry])
def get_error_breakdown(
    time_range: PerformanceTimeRange = Query("24h"),
    services: ServiceRegistry = Depends(get_service_container),
) -> List[ErrorAnalysisEntry]:
    """Return error distribution for failed generation jobs."""

    return services.analytics.get_error_breakdown(time_range)


@router.get("/timeseries", response_model=PerformanceAnalyticsCharts)
def get_time_series_metrics(
    time_range: PerformanceTimeRange = Query("24h"),
    services: ServiceRegistry = Depends(get_service_container),
) -> PerformanceAnalyticsCharts:
    """Return time-series metrics for dashboard visualisations."""

    return services.analytics.get_time_series_metrics(time_range)


@router.get("/insights", response_model=List[PerformanceInsightEntry])
def get_performance_insights(
    time_range: PerformanceTimeRange = Query("24h"),
    services: ServiceRegistry = Depends(get_service_container),
) -> List[PerformanceInsightEntry]:
    """Return derived performance insights for the requested window."""

    stats = services.analytics.get_generation_stats(time_range)
    errors = services.analytics.get_error_breakdown(time_range)
    charts = services.analytics.get_time_series_metrics(time_range)
    return services.analytics.get_performance_insights(stats, errors, charts)
