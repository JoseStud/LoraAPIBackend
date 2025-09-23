"""Adapter service for managing LoRA adapters."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set

from sqlmodel import Session, select

from backend.models import Adapter
from backend.schemas.adapters import AdapterCreate
from backend.services.storage import get_storage_service

from .repository import (
    save_adapter as repository_save_adapter,
)
from .repository import (
    update_adapter as repository_update_adapter,
)
from .repository import (
    upsert_adapter as repository_upsert_adapter,
)
from .search import AdapterSearchResult
from .search import search_adapters as repository_search_adapters
from .statistics import (
    count_active as statistics_count_active,
)
from .statistics import (
    count_recent_imports as statistics_count_recent_imports,
)
from .statistics import (
    count_total as statistics_count_total,
)
from .statistics import (
    get_dashboard_statistics as statistics_get_dashboard_statistics,
)
from .statistics import (
    get_featured_adapters as statistics_get_featured_adapters,
)


class AdapterService:
    """Service for adapter-related operations."""

    PATCHABLE_FIELDS: Set[str] = {
        "weight",
        "active",
        "ordinal",
        "tags",
        "description",
        "activation_text",
        "trained_words",
        "triggers",
        "archetype",
        "archetype_confidence",
        "visibility",
        "nsfw_level",
        "supports_generation",
        "sd_version",
    }

    def __init__(self, db_session: Session, storage_backend=None):
        """Initialize AdapterService with a DB session and storage backend.

        Args:
            db_session: Database session
            storage_backend: Storage backend for file validation (optional)

        """
        self.db_session = db_session
        self.storage_backend = storage_backend

    def validate_file_path(self, path: str) -> bool:
        """Return True if the given path exists and is readable.

        Args:
            path: File path to validate

        Returns:
            True if file exists and is readable

        """
        if self.storage_backend:
            return self.storage_backend.file_exists(path)

        # Fallback to storage service
        storage_service = get_storage_service()
        return storage_service.validate_file_path(path)

    def save_adapter(self, payload: AdapterCreate) -> Adapter:
        """Create and persist an Adapter from a creation payload."""

        return repository_save_adapter(self.db_session, payload)

    def upsert_adapter(self, payload: AdapterCreate) -> Adapter:
        """Idempotently create or update an adapter by (name, version)."""

        return repository_upsert_adapter(self.db_session, payload)

    def get_adapter(self, adapter_id: str) -> Optional[Adapter]:
        """Get an adapter by ID."""

        return self.db_session.get(Adapter, adapter_id)

    def list_adapters(
        self,
        active_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Adapter]:
        """List adapters with optional filtering and pagination."""

        query = select(Adapter)
        if active_only:
            query = query.where(Adapter.active)

        query = query.offset(offset).limit(limit)
        return list(self.db_session.exec(query).all())

    def count_total(self) -> int:
        """Return the total number of adapters stored."""

        return statistics_count_total(self.db_session)

    def count_active(self) -> int:
        """Return the number of adapters flagged as active."""

        return statistics_count_active(self.db_session)

    def count_recent_imports(
        self,
        *,
        since: Optional[datetime] = None,
        hours: int = 24,
    ) -> int:
        """Return number of adapters ingested within the recent window."""

        return statistics_count_recent_imports(self.db_session, since=since, hours=hours)

    def get_dashboard_statistics(self, *, recent_hours: int = 24) -> Dict[str, int]:
        """Return aggregate statistics used by the dashboard view."""

        return statistics_get_dashboard_statistics(self.db_session, recent_hours=recent_hours)

    def get_featured_adapters(self, limit: int = 5) -> List[Adapter]:
        """Return a list of adapters to highlight on the dashboard."""

        return statistics_get_featured_adapters(self.db_session, limit=limit)

    def search_adapters(
        self,
        *,
        search: str = "",
        active_only: bool = False,
        tags: Optional[Sequence[str]] = None,
        sort: str = "name",
        page: int = 1,
        per_page: int = 24,
    ) -> AdapterSearchResult:
        """Search adapters with filtering, sorting, and pagination rules."""

        return repository_search_adapters(
            self.db_session,
            search=search,
            active_only=active_only,
            tags=tags,
            sort=sort,
            page=page,
            per_page=per_page,
        )

    def list_active_ordered(self) -> List[Adapter]:
        """Return active adapters ordered and deduplicated."""

        query = select(Adapter).where(Adapter.active)
        adapters = self.db_session.exec(query).all()
        adapters.sort(key=lambda a: (a.ordinal if a.ordinal is not None else 0, a.name))

        # Deduplicate by name, keeping the one with the highest weight.
        seen = {}
        for adapter in adapters:
            if adapter.name not in seen or adapter.weight > seen[adapter.name].weight:
                seen[adapter.name] = adapter
        return list(seen.values())

    def update_adapter(
        self,
        adapter_id: str,
        updates: Dict[str, Any],
        *,
        commit: bool = True,
        refresh: bool = True,
    ) -> Optional[Adapter]:
        """Update an adapter with the given changes."""

        return repository_update_adapter(
            self.db_session,
            adapter_id,
            updates,
            commit=commit,
            refresh=refresh,
        )

    def delete_adapter(self, adapter_id: str, *, commit: bool = True) -> bool:
        """Delete an adapter by ID."""

        adapter = self.get_adapter(adapter_id)
        if adapter is None:
            return False

        self.db_session.delete(adapter)
        if commit:
            self.db_session.commit()
        return True

    def activate_adapter(self, adapter_id: str, ordinal: Optional[int] = None) -> Optional[Adapter]:
        """Activate an adapter and optionally set its ordinal."""

        updates: Dict[str, Any] = {"active": True, "updated_at": datetime.now(timezone.utc)}
        if ordinal is not None:
            updates["ordinal"] = ordinal

        return self.update_adapter(adapter_id, updates)

    def deactivate_adapter(self, adapter_id: str) -> Optional[Adapter]:
        """Deactivate an adapter."""

        return self.update_adapter(
            adapter_id,
            {"active": False, "updated_at": datetime.now(timezone.utc)},
        )

    def get_all_tags(self) -> List[str]:
        """Return a sorted list of all unique adapter tags."""

        rows = self.db_session.exec(select(Adapter.tags)).all()
        unique: Set[str] = set()

        for raw_tags in rows:
            if not raw_tags:
                continue

            if isinstance(raw_tags, (list, tuple, set)):
                tags_iterable = raw_tags
            elif isinstance(raw_tags, str):
                tags_iterable = [raw_tags]
            else:
                continue

            for tag in tags_iterable:
                if isinstance(tag, str) and tag.strip():
                    unique.add(tag.strip())

        return sorted(unique, key=lambda value: value.lower())

    def bulk_adapter_action(self, action: str, adapter_ids: Sequence[str]) -> List[str]:
        """Apply bulk state changes or deletions within a single transaction."""

        if not adapter_ids:
            return []

        adapters = self.db_session.exec(
            select(Adapter).where(Adapter.id.in_(list(adapter_ids))),
        ).all()

        processed: List[str] = []
        now = datetime.now(timezone.utc)

        try:
            if action in {"activate", "deactivate"}:
                new_state = action == "activate"
                for adapter in adapters:
                    updates = {"active": new_state, "updated_at": now}
                    self.update_adapter(
                        adapter.id,
                        updates,
                        commit=False,
                        refresh=False,
                    )
                    processed.append(adapter.id)
            elif action == "delete":
                for adapter in adapters:
                    if self.delete_adapter(adapter.id, commit=False):
                        processed.append(adapter.id)
            else:
                raise ValueError(f"Unsupported bulk action '{action}'")

            self.db_session.commit()
        except Exception:
            self.db_session.rollback()
            raise

        return processed

    def patch_adapter(self, adapter_id: str, payload: Dict[str, Any]) -> Adapter:
        """Apply a validated partial update to an adapter."""

        adapter = self.get_adapter(adapter_id)
        if adapter is None:
            raise LookupError("adapter not found")

        if not payload:
            raise ValueError("No valid fields provided for update")

        updates: Dict[str, Any] = {}

        for field, value in payload.items():
            if field not in self.PATCHABLE_FIELDS:
                allowed = ", ".join(sorted(self.PATCHABLE_FIELDS))
                raise ValueError(
                    f"Field '{field}' is not allowed to be modified. Allowed fields: {allowed}",
                )

            if field == "weight" and not isinstance(value, (int, float)):
                raise ValueError("Field 'weight' must be a number")
            if field == "active" and not isinstance(value, bool):
                raise ValueError("Field 'active' must be a boolean")
            if field == "ordinal" and value is not None and not isinstance(value, int):
                raise ValueError("Field 'ordinal' must be an integer or null")
            if field == "tags" and not isinstance(value, list):
                raise ValueError("Field 'tags' must be a list")
            if field == "nsfw_level" and not isinstance(value, int):
                raise ValueError("Field 'nsfw_level' must be an integer")

            updates[field] = value

        updates["updated_at"] = datetime.now(timezone.utc)

        updated = self.update_adapter(adapter_id, updates)
        if updated is None:
            raise LookupError("adapter not found")

        return updated
