"""Persistence helpers for adapter entities."""

from typing import Any, Dict, Optional

from sqlmodel import Session, select

from backend.models import Adapter
from backend.schemas.adapters import AdapterCreate


def save_adapter(db_session: Session, payload: AdapterCreate) -> Adapter:
    """Create and persist an Adapter from a creation payload."""
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
    db_session.add(adapter)
    db_session.commit()
    db_session.refresh(adapter)
    return adapter


def _apply_payload_updates(adapter: Adapter, payload: AdapterCreate) -> None:
    """Apply mutable payload fields to an existing adapter."""
    adapter.canonical_version_name = (
        payload.canonical_version_name or adapter.canonical_version_name
    )
    adapter.description = payload.description or adapter.description
    adapter.author_username = payload.author_username or adapter.author_username
    adapter.visibility = payload.visibility or adapter.visibility
    adapter.published_at = payload.published_at or adapter.published_at
    adapter.tags = payload.tags or adapter.tags
    adapter.trained_words = payload.trained_words or adapter.trained_words
    adapter.triggers = payload.triggers or adapter.triggers
    adapter.file_path = payload.file_path or adapter.file_path
    if payload.weight is not None:
        adapter.weight = payload.weight
    adapter.active = (
        payload.active if payload.active is not None else adapter.active
    )
    adapter.ordinal = (
        payload.ordinal if payload.ordinal is not None else adapter.ordinal
    )
    adapter.primary_file_name = payload.primary_file_name or adapter.primary_file_name
    adapter.primary_file_size_kb = (
        payload.primary_file_size_kb or adapter.primary_file_size_kb
    )
    adapter.primary_file_sha256 = (
        payload.primary_file_sha256 or adapter.primary_file_sha256
    )
    adapter.primary_file_download_url = (
        payload.primary_file_download_url or adapter.primary_file_download_url
    )
    adapter.primary_file_local_path = (
        payload.primary_file_local_path or adapter.primary_file_local_path
    )
    adapter.supports_generation = (
        payload.supports_generation
        if payload.supports_generation is not None
        else adapter.supports_generation
    )
    adapter.sd_version = payload.sd_version or adapter.sd_version
    adapter.nsfw_level = (
        payload.nsfw_level if payload.nsfw_level is not None else adapter.nsfw_level
    )
    adapter.activation_text = payload.activation_text or adapter.activation_text
    adapter.stats = payload.stats or adapter.stats
    adapter.extra = payload.extra or adapter.extra
    adapter.json_file_path = payload.json_file_path or adapter.json_file_path
    adapter.json_file_mtime = payload.json_file_mtime or adapter.json_file_mtime
    adapter.json_file_size = payload.json_file_size or adapter.json_file_size
    adapter.last_ingested_at = (
        payload.last_ingested_at or adapter.last_ingested_at
    )


def upsert_adapter(db_session: Session, payload: AdapterCreate) -> Adapter:
    """Idempotently create or update an adapter by (name, version)."""
    query = select(Adapter).where(Adapter.name == payload.name)
    if payload.version is None:
        query = query.where(Adapter.version.is_(None))
    else:
        query = query.where(Adapter.version == payload.version)

    existing = db_session.exec(query).first()
    if existing:
        _apply_payload_updates(existing, payload)
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)
        return existing

    return save_adapter(db_session, payload)


def update_adapter(
    db_session: Session,
    adapter_id: str,
    updates: Dict[str, Any],
    *,
    commit: bool = True,
    refresh: bool = True,
) -> Optional[Adapter]:
    """Update an adapter with the given changes."""
    adapter = db_session.get(Adapter, adapter_id)
    if adapter is None:
        return None

    for field, value in updates.items():
        if hasattr(adapter, field):
            setattr(adapter, field, value)

    db_session.add(adapter)
    if commit:
        db_session.commit()
        if refresh:
            db_session.refresh(adapter)
    return adapter
