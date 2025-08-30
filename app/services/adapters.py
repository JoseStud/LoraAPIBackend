"""Adapter service for managing LoRA adapters."""

from typing import List, Optional

from sqlmodel import Session, select

from app.models import Adapter
from app.schemas.adapters import AdapterCreate
from app.services.storage import get_storage_service


class AdapterService:
    """Service for adapter-related operations."""

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
            weight=payload.weight or 1.0,
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
            existing.weight = payload.weight or existing.weight
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

    def update_adapter(self, adapter_id: str, updates: dict) -> Optional[Adapter]:
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
        self.db_session.commit()
        self.db_session.refresh(adapter)
        return adapter

    def delete_adapter(self, adapter_id: str) -> bool:
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
        updates = {"active": True}
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
        return self.update_adapter(adapter_id, {"active": False})
