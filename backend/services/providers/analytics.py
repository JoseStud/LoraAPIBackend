"""Analytics service provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from sqlmodel import Session

from ..analytics import AnalyticsService, InsightGenerator, TimeSeriesBuilder
from ..analytics_repository import AnalyticsRepository


class AnalyticsServiceFactory(Protocol):
    """Callable protocol for creating :class:`AnalyticsService` instances."""

    def __call__(
        self,
        db_session: Session,
        *,
        repository: AnalyticsRepository,
        time_series_builder: Optional[TimeSeriesBuilder] = None,
        insight_generator: Optional[InsightGenerator] = None,
    ) -> AnalyticsService:
        ...


def make_analytics_service(
    db_session: Session,
    *,
    repository: AnalyticsRepository,
    time_series_builder: Optional[TimeSeriesBuilder] = None,
    insight_generator: Optional[InsightGenerator] = None,
) -> AnalyticsService:
    """Create an :class:`AnalyticsService` with explicit collaborators."""
    return AnalyticsService(
        db_session,
        repository=repository,
        time_series_builder=time_series_builder or TimeSeriesBuilder(),
        insight_generator=insight_generator or InsightGenerator(),
    )


@dataclass(frozen=True)
class AnalyticsProviders:
    """Grouped analytics-related provider callables."""

    analytics: AnalyticsServiceFactory = make_analytics_service


__all__ = [
    "AnalyticsProviders",
    "AnalyticsServiceFactory",
    "make_analytics_service",
]

