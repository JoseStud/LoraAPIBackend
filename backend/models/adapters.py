"""Adapter database model."""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel

adapter_table_args = (
    Index("ux_adapter_name_version", "name", "version", unique=True),
    Index("idx_adapter_active", "active"),
    Index("idx_adapter_json_file_path", "json_file_path"),
    Index("idx_adapter_created_at", "created_at"),
    Index("idx_adapter_updated_at", "updated_at"),
    Index("idx_adapter_last_ingested_at", "last_ingested_at"),
)


class Adapter(SQLModel, table=True):
    """Metadata model describing a LoRA adapter file and hints for composition."""

    __table_args__ = adapter_table_args

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    name: str
    version: Optional[str] = None
    canonical_version_name: Optional[str] = None
    description: Optional[str] = None
    author_username: Optional[str] = None
    visibility: str = "Public"
    published_at: Optional[datetime] = None
    # tags stored as JSON-compatible column (portable across SQLite/Postgres)
    tags: list = Field(default_factory=list, sa_column=Column(JSON))
    trained_words: list = Field(default_factory=list, sa_column=Column(JSON))
    triggers: list = Field(default_factory=list, sa_column=Column(JSON))
    file_path: str
    weight: float = 1.0
    active: bool = False
    ordinal: Optional[int] = None
    archetype: Optional[str] = None
    archetype_confidence: Optional[float] = None
    primary_file_name: Optional[str] = None
    primary_file_size_kb: Optional[int] = None
    primary_file_sha256: Optional[str] = None
    primary_file_download_url: Optional[str] = None
    primary_file_local_path: Optional[str] = None
    supports_generation: bool = False
    sd_version: Optional[str] = None
    nsfw_level: int = 0
    activation_text: Optional[str] = None
    stats: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    extra: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    # Ingestion tracking
    json_file_path: Optional[str] = None  # Source JSON file path
    json_file_mtime: Optional[datetime] = None  # JSON file modification time
    json_file_size: Optional[int] = None  # JSON file size in bytes
    last_ingested_at: Optional[datetime] = None  # When this record was last ingested
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
