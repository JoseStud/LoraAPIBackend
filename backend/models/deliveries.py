"""Delivery job database model."""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel


class DeliveryJob(SQLModel, table=True):
    """Simple background job record for delivery processing."""

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    prompt: str = Field(sa_type=Text)
    mode: str
    params: Optional[str] = Field(
        default=None, sa_type=Text
    )  # JSON string for simplicity
    status: str = "pending"
    result: Optional[str] = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    started_at: Optional[datetime] = Field(
        default=None, sa_type=DateTime(timezone=True)
    )
    finished_at: Optional[datetime] = Field(
        default=None, sa_type=DateTime(timezone=True)
    )
    rating: Optional[int] = Field(default=None, ge=0, le=5)
    is_favorite: bool = Field(default=False)
    rating_updated_at: Optional[datetime] = Field(
        default=None, sa_type=DateTime(timezone=True)
    )
    favorite_updated_at: Optional[datetime] = Field(
        default=None, sa_type=DateTime(timezone=True)
    )
