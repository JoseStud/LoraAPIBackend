"""Pydantic models for analytics payloads."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, Field

PerformanceTimeRange = Literal["24h", "7d", "30d"]


class PerformanceKpiSummary(BaseModel):
    """Key performance indicators for generation analytics."""

    total_generations: int = 0
    generation_growth: float = 0.0
    avg_generation_time: float = 0.0
    time_improvement: float = 0.0
    success_rate: float = 0.0
    total_failed: int = 0
    active_loras: int = 0
    total_loras: int = 0


class GenerationVolumePoint(BaseModel):
    """Time-series point representing generation volume."""

    timestamp: datetime
    count: int


class PerformanceSeriesPoint(BaseModel):
    """Time-series point representing performance metrics."""

    timestamp: datetime
    avg_time: float
    success_rate: float


class LoraUsageSlice(BaseModel):
    """Breakdown entry describing LoRA usage distribution."""

    name: str
    usage_count: int


class ResourceUsagePoint(BaseModel):
    """Time-series point representing system resource utilisation."""

    timestamp: datetime
    cpu_percent: float
    memory_percent: float
    gpu_percent: float


class PerformanceAnalyticsCharts(BaseModel):
    """Collection of chart data used by the analytics dashboard."""

    generation_volume: List[GenerationVolumePoint] = Field(default_factory=list)
    performance: List[PerformanceSeriesPoint] = Field(default_factory=list)
    lora_usage: List[LoraUsageSlice] = Field(default_factory=list)
    resource_usage: List[ResourceUsagePoint] = Field(default_factory=list)


class ErrorAnalysisEntry(BaseModel):
    """Error breakdown entry with counts and percentages."""

    type: str
    count: int
    percentage: float
    description: str


class PerformanceInsightEntry(BaseModel):
    """Actionable insight generated from analytics data."""

    id: str
    title: str
    description: str
    severity: str
    recommendation: str | None = None


class PerformanceAnalyticsSummary(BaseModel):
    """Aggregated analytics payload returned by the API."""

    time_range: PerformanceTimeRange
    generated_at: datetime
    kpis: PerformanceKpiSummary = Field(default_factory=PerformanceKpiSummary)
    chart_data: PerformanceAnalyticsCharts = Field(
        default_factory=PerformanceAnalyticsCharts
    )
    error_breakdown: List[ErrorAnalysisEntry] = Field(default_factory=list)
    performance_insights: List[PerformanceInsightEntry] = Field(default_factory=list)
