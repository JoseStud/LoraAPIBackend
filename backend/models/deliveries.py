"""Delivery job database model."""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel


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
