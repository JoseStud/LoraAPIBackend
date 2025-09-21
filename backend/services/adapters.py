"""Adapter service for managing LoRA adapters."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, List, Optional, Sequence, Set

from sqlalchemy import func
from sqlmodel import Session, select

from backend.models import Adapter
from backend.schemas.adapters import AdapterCreate
from backend.services.storage import get_storage_service


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
        """Create and persist an Adapter from a creation payload.
        
        Args:
            payload: Adapter creation data
            
        Returns:
            Created Adapter instance

        """
        adapter = Adapter(
            name=payload.name,
            version=payload.version,
            canonical_version_name=payload.canonical_version_name,
            description=payload.description,
            author_username=payload.author_username,
            visibility=payload.visibility or "Public",
            published_at=payload.published_at,
            tags=payload.tags or [],
            trained_words=payload.trained_words or [],
            triggers=payload.triggers or [],
            file_path=payload.file_path,
            weight=payload.weight if payload.weight is not None else 1.0,
            active=payload.active or False,
            ordinal=payload.ordinal,
            primary_file_name=payload.primary_file_name,
            primary_file_size_kb=payload.primary_file_size_kb,
            primary_file_sha256=payload.primary_file_sha256,
            primary_file_download_url=payload.primary_file_download_url,
            primary_file_local_path=payload.primary_file_local_path,
            supports_generation=payload.supports_generation or False,
            sd_version=payload.sd_version,
            nsfw_level=payload.nsfw_level or 0,
            activation_text=payload.activation_text,
            stats=payload.stats,
            extra=payload.extra,
            # Ingestion tracking
            json_file_path=payload.json_file_path,
            json_file_mtime=payload.json_file_mtime,
            json_file_size=payload.json_file_size,
            last_ingested_at=payload.last_ingested_at,
        )
        self.db_session.add(adapter)
        self.db_session.commit()
        self.db_session.refresh(adapter)
        return adapter

    def upsert_adapter(self, payload: AdapterCreate) -> Adapter:
        """Idempotently create or update an adapter by (name, version).

        If an adapter with the same name and version exists, update mutable
        fields and return it. Otherwise create a new adapter.
        
        Args:
            payload: Adapter creation/update data
            
        Returns:
            Created or updated Adapter instance

        """
        # Simple uniqueness: name + version (version may be None)
        q = select(Adapter).where(Adapter.name == payload.name)
        if payload.version is None:
            q = q.where(Adapter.version.is_(None))
        else:
            q = q.where(Adapter.version == payload.version)

        existing = self.db_session.exec(q).first()
        if existing:
            # update all mutable fields
            existing.canonical_version_name = payload.canonical_version_name or existing.canonical_version_name
            existing.description = payload.description or existing.description
            existing.author_username = payload.author_username or existing.author_username
            existing.visibility = payload.visibility or existing.visibility
            existing.published_at = payload.published_at or existing.published_at
            existing.tags = payload.tags or existing.tags
            existing.trained_words = payload.trained_words or existing.trained_words
            existing.triggers = payload.triggers or existing.triggers
            existing.file_path = payload.file_path or existing.file_path
            if payload.weight is not None:
                existing.weight = payload.weight
            existing.active = payload.active if payload.active is not None else existing.active
            existing.ordinal = payload.ordinal if payload.ordinal is not None else existing.ordinal
            existing.primary_file_name = payload.primary_file_name or existing.primary_file_name
            existing.primary_file_size_kb = payload.primary_file_size_kb or existing.primary_file_size_kb
            existing.primary_file_sha256 = payload.primary_file_sha256 or existing.primary_file_sha256
            existing.primary_file_download_url = payload.primary_file_download_url or existing.primary_file_download_url
            existing.primary_file_local_path = payload.primary_file_local_path or existing.primary_file_local_path
            existing.supports_generation = payload.supports_generation if payload.supports_generation is not None else existing.supports_generation
            existing.sd_version = payload.sd_version or existing.sd_version
            existing.nsfw_level = payload.nsfw_level if payload.nsfw_level is not None else existing.nsfw_level
            existing.activation_text = payload.activation_text or existing.activation_text
            existing.stats = payload.stats or existing.stats
            existing.extra = payload.extra or existing.extra
            # Update ingestion tracking
            existing.json_file_path = payload.json_file_path or existing.json_file_path
            existing.json_file_mtime = payload.json_file_mtime or existing.json_file_mtime
            existing.json_file_size = payload.json_file_size or existing.json_file_size
            existing.last_ingested_at = payload.last_ingested_at or existing.last_ingested_at
            self.db_session.add(existing)
            self.db_session.commit()
            self.db_session.refresh(existing)
            return existing

        return self.save_adapter(payload)

    def get_adapter(self, adapter_id: str) -> Optional[Adapter]:
        """Get an adapter by ID.
        
        Args:
            adapter_id: Adapter ID
            
        Returns:
            Adapter instance or None if not found

        """
        return self.db_session.get(Adapter, adapter_id)

    def list_adapters(self, active_only: bool = False, limit: int = 100, offset: int = 0) -> List[Adapter]:
        """List adapters with optional filtering and pagination.

        Args:
            active_only: If True, only return active adapters
            limit: Maximum number of adapters to return
            offset: Number of adapters to skip

        Returns:
            List of Adapter instances

        """
        q = select(Adapter)
        if active_only:
            q = q.where(Adapter.active)

        q = q.offset(offset).limit(limit)
        return list(self.db_session.exec(q).all())

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
        """Search adapters with filtering, sorting, and pagination rules.

        Args:
            search: Case-insensitive substring to match against adapter names.
            active_only: When True, only return adapters marked active.
            tags: Optional list of tag filters. Any match qualifies the adapter.
            sort: Sort key ("name", "created_at", "updated_at", "file_size").
            page: One-based page number to return.
            per_page: Number of items to include per page.

        Returns:
            AdapterSearchResult describing the filtered items and pagination.
        """

        base_query = select(Adapter)
        filters = []

        if search:
            filters.append(Adapter.name.ilike(f"%{search}%"))

        if active_only:
            filters.append(Adapter.active)

        tag_filters = [str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()]
        if tag_filters:
            bind = self.db_session.get_bind()
            dialect_name = bind.dialect.name if bind is not None else "sqlite"
            if dialect_name == "postgresql":
                tag_func = func.jsonb_array_elements_text
            else:
                tag_func = func.json_each

            tag_alias = tag_func(Adapter.tags).table_valued("value").alias("tag")
            tag_exists = (
                select(1)
                .select_from(tag_alias)
                .where(func.lower(tag_alias.c.value).in_(tag_filters))
                .correlate(Adapter)
                .exists()
            )
            filters.append(tag_exists)

        if filters:
            base_query = base_query.where(*filters)

        count_query = select(func.count()).select_from(Adapter)
        if filters:
            count_query = count_query.where(*filters)

        filtered_count = self.db_session.exec(count_query).one()

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

        page_query = (
            base_query.order_by(*order_clause).offset(offset).limit(per_page_value)
        )
        items = list(self.db_session.exec(page_query).all())

        total_pages = (
            (filtered_count + per_page_value - 1) // per_page_value if filtered_count else 0
        )

        return AdapterSearchResult(
            items=items,
            total=filtered_count,
            filtered=filtered_count,
            page=page_value,
            pages=total_pages,
            per_page=per_page_value,
        )

    def list_active_ordered(self) -> List[Adapter]:
        """Return active adapters ordered and deduplicated.
        
        Returns:
            List of active adapters, ordered by ordinal then name

        """
        q = select(Adapter).where(Adapter.active)
        adapters = self.db_session.exec(q).all()
        adapters.sort(key=lambda a: (a.ordinal if a.ordinal is not None else 0, a.name))
        
        # Deduplicate by name, keeping the one with the highest weight.
        seen = {}
        for a in adapters:
            if a.name not in seen or a.weight > seen[a.name].weight:
                seen[a.name] = a
        return list(seen.values())

    def update_adapter(
        self,
        adapter_id: str,
        updates: dict,
        *,
        commit: bool = True,
        refresh: bool = True,
    ) -> Optional[Adapter]:
        """Update an adapter with the given changes.
        
        Args:
            adapter_id: Adapter ID
            updates: Dict of field updates
            
        Returns:
            Updated Adapter instance or None if not found

        """
        adapter = self.get_adapter(adapter_id)
        if adapter is None:
            return None
        
        for field, value in updates.items():
            if hasattr(adapter, field):
                setattr(adapter, field, value)
        
        self.db_session.add(adapter)
        if commit:
            self.db_session.commit()
            if refresh:
                self.db_session.refresh(adapter)
        return adapter

    def delete_adapter(self, adapter_id: str, *, commit: bool = True) -> bool:
        """Delete an adapter by ID.
        
        Args:
            adapter_id: Adapter ID
            
        Returns:
            True if adapter was deleted, False if not found

        """
        adapter = self.get_adapter(adapter_id)
        if adapter is None:
            return False
        
        self.db_session.delete(adapter)
        if commit:
            self.db_session.commit()
        return True

    def activate_adapter(self, adapter_id: str, ordinal: Optional[int] = None) -> Optional[Adapter]:
        """Activate an adapter and optionally set its ordinal.
        
        Args:
            adapter_id: Adapter ID
            ordinal: Optional ordering position
            
        Returns:
            Updated Adapter instance or None if not found

        """
        updates = {"active": True, "updated_at": datetime.now(timezone.utc)}
        if ordinal is not None:
            updates["ordinal"] = ordinal

        return self.update_adapter(adapter_id, updates)

    def deactivate_adapter(self, adapter_id: str) -> Optional[Adapter]:
        """Deactivate an adapter.
        
        Args:
            adapter_id: Adapter ID
            
        Returns:
            Updated Adapter instance or None if not found

        """
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
            select(Adapter).where(Adapter.id.in_(list(adapter_ids)))
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

    def patch_adapter(self, adapter_id: str, payload: dict) -> Adapter:
        """Apply a validated partial update to an adapter."""

        adapter = self.get_adapter(adapter_id)
        if adapter is None:
            raise LookupError("adapter not found")

        if not payload:
            raise ValueError("No valid fields provided for update")

        updates: dict[str, Any] = {}

        for field, value in payload.items():
            if field not in self.PATCHABLE_FIELDS:
                allowed = ", ".join(sorted(self.PATCHABLE_FIELDS))
                raise ValueError(
                    f"Field '{field}' is not allowed to be modified. Allowed fields: {allowed}"
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
