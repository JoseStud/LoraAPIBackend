"""Data access layer for analytics queries."""

from __future__ import annotations

from datetime import datetime
from typing import List, Sequence, Tuple

from sqlalchemy import func, select
from sqlmodel import Session

from backend.models import Adapter, DeliveryJob

TimeSeriesRow = Tuple[
    datetime | None,
    str | None,
    datetime | None,
    datetime | None,
]


class AnalyticsRepository:
    """Encapsulate SQLModel interactions for analytics computations."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Generation job metrics
    # ------------------------------------------------------------------
    def count_jobs(
        self,
        start: datetime,
        end: datetime,
        *,
        status: str | None = None,
    ) -> int:
        """Count generation jobs within the supplied window."""

        query = (
            select(func.count(DeliveryJob.id))
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.created_at >= start)
            .where(DeliveryJob.created_at < end)
        )
        if status is not None:
            query = query.where(DeliveryJob.status == status)

        result = self._session.exec(query).one()
        return int(result or 0)

    def average_duration(self, start: datetime, end: datetime) -> float:
        """Return the mean execution time for completed jobs in the window."""

        query = (
            select(DeliveryJob.started_at, DeliveryJob.finished_at)
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.finished_at.is_not(None))
            .where(DeliveryJob.started_at.is_not(None))
            .where(DeliveryJob.created_at >= start)
            .where(DeliveryJob.created_at < end)
        )

        durations: List[float] = []
        for started_at, finished_at in self._session.exec(query):
            if started_at and finished_at and finished_at >= started_at:
                durations.append((finished_at - started_at).total_seconds())

        if not durations:
            return 0.0
        return sum(durations) / len(durations)

    def fetch_time_series_rows(self, start: datetime, end: datetime) -> List[TimeSeriesRow]:
        """Return time-series raw data for aggregation."""

        query = (
            select(
                DeliveryJob.created_at,
                DeliveryJob.status,
                DeliveryJob.started_at,
                DeliveryJob.finished_at,
            )
            .where(DeliveryJob.mode == "sdnext")
            .where(DeliveryJob.created_at >= start)
            .where(DeliveryJob.created_at < end)
        )

        rows: Sequence[TimeSeriesRow] = self._session.exec(query).all()
        return list(rows)

    # ------------------------------------------------------------------
    # Adapter usage metrics
    # ------------------------------------------------------------------
    def active_lora_usage_counts(self) -> List[Tuple[str, int]]:
        """Return ordered usage counts for active LoRA adapters."""

        query = select(Adapter.name, Adapter.stats).where(Adapter.active.is_(True))
        usage: List[Tuple[str, int]] = []

        for name, stats in self._session.exec(query):
            usage_count = 0
            if isinstance(stats, dict):
                for key in ("usage_count", "generations", "activations"):
                    value = stats.get(key)
                    if isinstance(value, (int, float)):
                        usage_count = int(value)
                        break
            if usage_count > 0:
                usage.append((name, usage_count))

        usage.sort(key=lambda item: item[1], reverse=True)
        return usage

    def count_active_loras(self) -> int:
        """Count currently active adapters."""

        result = self._session.exec(
            select(func.count(Adapter.id)).where(Adapter.active.is_(True))
        ).one()
        return int(result or 0)

    def count_total_loras(self) -> int:
        """Count all registered adapters."""

        result = self._session.exec(select(func.count(Adapter.id))).one()
        return int(result or 0)

