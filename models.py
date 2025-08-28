"""SQLModel models for adapters and delivery jobs."""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Adapter(SQLModel, table=True):
    """Metadata model describing a LoRA adapter file and hints for composition."""

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    name: str
    version: Optional[str] = None
    # tags stored as JSON-compatible column (portable across SQLite/Postgres)
    tags: list = Field(default_factory=list, sa_column=Column(JSON))
    file_path: str
    weight: float = 1.0
    active: bool = False
    ordinal: Optional[int] = None
    archetype: Optional[str] = None
    archetype_confidence: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DeliveryJob(SQLModel, table=True):
    """Simple background job record for delivery processing."""

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    prompt: str
    mode: str
    params: Optional[str] = None  # JSON string for simplicity
    status: str = "pending"
    result: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
