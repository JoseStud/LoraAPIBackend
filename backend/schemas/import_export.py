"""Schemas related to import/export and backup workflows."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ExportConfig(BaseModel):
    """Export configuration schema shared across services."""

    loras: bool = False
    lora_files: bool = False
    lora_metadata: bool = False
    lora_embeddings: bool = False
    generations: bool = False
    generation_range: str = "all"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    user_data: bool = False
    system_config: bool = False
    analytics: bool = False
    format: str = "zip"
    compression: str = "balanced"
    split_archives: bool = False
    max_size_mb: int = 1024
    encrypt: bool = False
    password: Optional[str] = None


class ExportEstimate(BaseModel):
    """Export size and time estimates."""

    size: str
    time: str


class ImportConfig(BaseModel):
    """Import configuration schema."""

    mode: str = "merge"
    conflict_resolution: str = "ask"
    validate: bool = True
    backup_before: bool = True
    password: Optional[str] = None


class BackupHistoryItem(BaseModel):
    """Backup history item schema."""

    id: str
    created_at: datetime
    type: str
    size: Optional[int] = Field(default=None, ge=0)
    status: str


class BackupCreateRequest(BaseModel):
    """Request body for initiating a backup operation."""

    backup_type: str = Field(default="full", alias="backup_type")

    model_config = {
        "populate_by_name": True,
    }

