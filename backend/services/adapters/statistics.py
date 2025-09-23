"""Aggregate and statistics helpers for adapters."""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import Adapter


def count_total(db_session: Session) -> int:
    """Return the total number of adapters stored."""

    result = db_session.exec(select(func.count(Adapter.id))).one()
    return int(result or 0)


def count_active(db_session: Session) -> int:
    """Return the number of adapters flagged as active."""

    result = db_session.exec(select(func.count(Adapter.id)).where(Adapter.active)).one()
    return int(result or 0)


def count_recent_imports(
    db_session: Session,
    *,
    since: Optional[datetime] = None,
    hours: int = 24,
) -> int:
    """Return number of adapters ingested within the recent window."""

    if since is None:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)

    timestamp_column = func.coalesce(Adapter.last_ingested_at, Adapter.created_at)
    result = db_session.exec(
        select(func.count(Adapter.id)).where(timestamp_column >= since),
    ).one()
    return int(result or 0)


def get_dashboard_statistics(
    db_session: Session,
    *,
    recent_hours: int = 24,
) -> Dict[str, int]:
    """Return aggregate statistics used by the dashboard view."""

    total = count_total(db_session)
    active = count_active(db_session)
    recent_imports = count_recent_imports(db_session, hours=recent_hours)
    embeddings_coverage = int(round((active / total) * 100)) if total else 0

    return {
        "total_loras": total,
        "active_loras": active,
        "embeddings_coverage": embeddings_coverage,
        "recent_imports": recent_imports,
    }


def get_featured_adapters(db_session: Session, limit: int = 5) -> List[Adapter]:
    """Return a list of adapters to highlight on the dashboard."""

    order_clause = func.coalesce(Adapter.updated_at, Adapter.created_at).desc()
    query = (
        select(Adapter)
        .where(Adapter.active.is_(True))
        .order_by(order_clause, Adapter.name)
        .limit(limit)
    )
    return list(db_session.exec(query).all())
