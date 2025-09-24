"""Adapter-related schemas."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    StrictBool,
    StrictFloat,
    StrictInt,
    field_validator,
)


class AdapterCreate(BaseModel):
    """Input model for creating an adapter."""

    name: str
    version: Optional[str] = None
    canonical_version_name: Optional[str] = None
    description: Optional[str] = None
    author_username: Optional[str] = None
    visibility: Optional[str] = "Public"
    published_at: Optional[datetime] = None
    tags: Optional[List[str]] = None
    trained_words: Optional[List[str]] = None
    triggers: Optional[List[str]] = None
    file_path: str
    weight: Optional[float] = 1.0
    active: Optional[bool] = False
    ordinal: Optional[int] = None
    primary_file_name: Optional[str] = None
    primary_file_size_kb: Optional[int] = None
    primary_file_sha256: Optional[str] = None
    primary_file_download_url: Optional[str] = None
    primary_file_local_path: Optional[str] = None
    supports_generation: Optional[bool] = False
    sd_version: Optional[str] = None
    nsfw_level: Optional[int] = 0
    activation_text: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None
    extra: Optional[Dict[str, Any]] = None
    # Ingestion tracking (optional for API, used by importer)
    json_file_path: Optional[str] = None
    json_file_mtime: Optional[datetime] = None
    json_file_size: Optional[int] = None
    last_ingested_at: Optional[datetime] = None

    # Defensive validators -----------------------------------------------
    @field_validator("primary_file_size_kb", mode="before")
    def _coerce_primary_file_size_kb(cls, v):
        """Coerce float-ish numeric sizes into integers.

        Some Civitai JSON uses float values for sizeKB (e.g. 223109.61328125).
        Pydantic's int fields reject floats with fractional parts. Convert
        to int by rounding to nearest integer when possible.
        """
        if v is None:
            return v
        try:
            # Accept numeric strings too
            f = float(v)
        except Exception:
            return v
        # Round to nearest integer and return as int
        return int(round(f))


class AdapterRead(BaseModel):
    """Public read model for adapters."""

    id: str
    name: str
    version: Optional[str] = None
    canonical_version_name: Optional[str] = None
    description: Optional[str] = None
    author_username: Optional[str] = None
    visibility: str = "Public"
    published_at: Optional[datetime] = None
    tags: List[str]
    trained_words: List[str]
    triggers: List[str]
    file_path: str
    weight: float
    active: bool
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
    stats: Optional[Dict[str, Any]] = None
    extra: Optional[Dict[str, Any]] = None
    json_file_path: Optional[str] = None
    json_file_mtime: Optional[datetime] = None
    json_file_size: Optional[int] = None
    last_ingested_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AdapterWrapper(BaseModel):
    """Wrapper for a single Adapter in responses."""

    adapter: AdapterRead


class AdapterListResponse(BaseModel):
    """Paginated list response for adapters."""

    items: List[AdapterRead]
    total: int
    filtered: int
    page: int
    pages: int
    per_page: int


class AdapterPatch(BaseModel):
    """Partial update payload for adapter resources."""

    model_config = ConfigDict(extra="forbid")

    weight: Optional[StrictFloat | StrictInt] = None
    active: Optional[StrictBool] = None
    ordinal: Optional[StrictInt] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    activation_text: Optional[str] = None
    trained_words: Optional[List[str]] = None
    triggers: Optional[List[str]] = None
    archetype: Optional[str] = None
    archetype_confidence: Optional[StrictFloat] = None
    visibility: Optional[str] = None
    nsfw_level: Optional[StrictInt] = None
    supports_generation: Optional[StrictBool] = None
    sd_version: Optional[str] = None

    @field_validator("tags", "trained_words", "triggers", mode="before")
    @classmethod
    def _validate_string_list(cls, value):
        """Ensure list-based fields receive iterable collections."""

        if value is None:
            return value
        if isinstance(value, list):
            return value
        raise TypeError("value must be a list of strings")
