"""Search helpers for adapter queries."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence

from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import Adapter

from .statistics import count_total

EPOCH = datetime.fromtimestamp(0, tz=timezone.utc)


@dataclass
class AdapterSearchResult:
    """Structured result returned when searching adapters."""

    items: List[Adapter]
    total: int
    filtered: int
    page: int
    pages: int
    per_page: int


def _normalize_tags(tags: Optional[Sequence[str]]) -> List[str]:
    """Normalize tag filters for comparison."""
    if not tags:
        return []

    normalized: List[str] = []
    for tag in tags:
        if tag is None:
            continue
        value = str(tag).strip().lower()
        if value:
            normalized.append(value)
    return normalized


def _build_tag_filter_expression(db_session: Session, tag_filters: List[str]):
    """Create a SQL expression that checks for any matching tag."""
    if not tag_filters:
        return None

    bind = db_session.get_bind()
    dialect_name = bind.dialect.name if bind is not None else "sqlite"
    if dialect_name == "postgresql":
        tag_func = func.jsonb_array_elements_text
    else:
        tag_func = func.json_each

    tag_alias = tag_func(Adapter.tags).table_valued("value").alias("tag")
    return (
        select(1)
        .select_from(tag_alias)
        .where(func.lower(tag_alias.c.value).in_(tag_filters))
        .correlate(Adapter)
        .exists()
    )


def search_adapters(
    db_session: Session,
    *,
    search: str = "",
    active_only: bool = False,
    tags: Optional[Sequence[str]] = None,
    sort: str = "name",
    page: int = 1,
    per_page: int = 24,
) -> AdapterSearchResult:
    """Search adapters with filtering, sorting, and pagination rules."""
    total_count = count_total(db_session)
    base_query = select(Adapter)
    filters = []

    if search:
        filters.append(Adapter.name.ilike(f"%{search}%"))

    if active_only:
        filters.append(Adapter.active)

    tag_filters = _normalize_tags(tags)
    tag_expression = _build_tag_filter_expression(db_session, tag_filters)
    if tag_expression is not None:
        filters.append(tag_expression)

    if filters:
        base_query = base_query.where(*filters)

    count_query = select(func.count()).select_from(Adapter)
    if filters:
        count_query = count_query.where(*filters)

    filtered_count_result = db_session.exec(count_query).one()
    filtered_count = int(filtered_count_result or 0)

    per_page_value = max(per_page, 1)
    page_value = max(page, 1)
    offset = (page_value - 1) * per_page_value

    sort_key = (sort or "name").lower()
    name_sort = func.lower(func.coalesce(Adapter.name, ""))
    if sort_key == "created_at":
        order_clause = [
            func.coalesce(Adapter.created_at, EPOCH).desc(),
            name_sort,
        ]
    elif sort_key == "updated_at":
        order_clause = [
            func.coalesce(Adapter.updated_at, EPOCH).desc(),
            name_sort,
        ]
    elif sort_key == "file_size":
        order_clause = [func.coalesce(Adapter.primary_file_size_kb, 0).desc(), name_sort]
    else:
        order_clause = [name_sort]

    page_query = base_query.order_by(*order_clause).offset(offset).limit(per_page_value)
    items = list(db_session.exec(page_query).all())

    total_pages = (
        (filtered_count + per_page_value - 1) // per_page_value if filtered_count else 0
    )

    return AdapterSearchResult(
        items=items,
        total=total_count,
        filtered=filtered_count,
        page=page_value,
        pages=total_pages,
        per_page=per_page_value,
    )
