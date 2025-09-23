"""Analytics service package exports."""

from .insights import InsightGenerator
from .service import AnalyticsService
from .time_series import TimeSeriesBuilder

__all__ = ["AnalyticsService", "TimeSeriesBuilder", "InsightGenerator"]

