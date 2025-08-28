"""Pydantic request and response schemas for the HTTP API."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class AdapterCreate(BaseModel):
    """Input model for creating an adapter."""

    name: str
    version: Optional[str] = None
    tags: Optional[List[str]] = None
    file_path: Optional[str] = None
    metadata_uri: Optional[str] = None
    weight: Optional[float] = 1.0
    active: Optional[bool] = False
    ordinal: Optional[int] = None


class AdapterRead(BaseModel):
    """Public read model for adapters."""

    id: str
    name: str
    version: Optional[str] = None
    tags: List[str]
    file_path: str
    weight: float
    active: bool
    ordinal: Optional[int] = None
    archetype: Optional[str] = None
    archetype_confidence: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class AdapterWrapper(BaseModel):
    """Wrapper for a single Adapter in responses."""

    adapter: AdapterRead


class AdapterListResponse(BaseModel):
    """Paginated list response for adapters."""

    items: List[AdapterRead]
    total: int
    limit: int
    offset: int


class ComposeDeliveryHTTP(BaseModel):
    """HTTP delivery configuration for compose requests."""

    host: str
    port: Optional[int] = None
    path: Optional[str] = None


class ComposeDeliveryCLI(BaseModel):
    """CLI-specific delivery parameters."""

    template: Optional[str] = None


class ComposeDelivery(BaseModel):
    """Delivery configuration for compose requests."""

    mode: str
    http: Optional[ComposeDeliveryHTTP] = None
    cli: Optional[ComposeDeliveryCLI] = None


class ComposeDeliveryInfo(BaseModel):
    """Information about an enqueued or scheduled delivery."""

    id: str
    status: str


class ComposeResponse(BaseModel):
    """Response returned from the compose endpoint."""

    prompt: str
    tokens: List[str]
    delivery: Optional[ComposeDeliveryInfo] = None


class ComposeRequest(BaseModel):
    """Request body for composing a prompt."""

    prefix: Optional[str] = None
    suffix: Optional[str] = None
    delivery: Optional[ComposeDelivery] = None


class DeliveryCreate(BaseModel):
    """Request body for creating a delivery job."""

    prompt: str
    mode: str
    params: Optional[Dict[str, Any]] = None


class DeliveryRead(BaseModel):
    """Read model for a delivery job."""

    id: str
    prompt: str
    mode: str
    params: Dict[str, Any]
    status: str
    result: Optional[Any] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class DeliveryWrapper(BaseModel):
    """Wrapper for delivery read responses."""

    delivery: DeliveryRead


class DeliveryCreateResponse(BaseModel):
    """Response returned when a delivery is created."""

    delivery_id: str
