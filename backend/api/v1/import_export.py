"""Import/Export API endpoints backed by archive helpers."""

import math
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.config import settings
from backend.core.dependencies import get_archive_service
from backend.services.archive import ArchiveService

router = APIRouter(tags=["import-export"])


class ExportConfig(BaseModel):
    """Export configuration schema."""

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
    created_at: str
    type: str
    size: int
    status: str


def _format_size(num_bytes: int) -> str:
    if num_bytes <= 0:
        return "0 Bytes"
    units = ["Bytes", "KB", "MB", "GB", "TB"]
    exponent = 0
    value = float(num_bytes)
    while value >= 1024 and exponent < len(units) - 1:
        value /= 1024
        exponent += 1
    return f"{value:.2f} {units[exponent]}"


def _format_duration(seconds: float) -> str:
    if seconds <= 0:
        return "0 seconds"
    if seconds < 60:
        return f"{max(1, math.ceil(seconds))} seconds"
    minutes = math.ceil(seconds / 60)
    return f"{minutes} minutes"


@router.post("/export/estimate")
async def estimate_export(
    config: ExportConfig,
    archive_service: ArchiveService = Depends(get_archive_service),  # noqa: B008
) -> ExportEstimate:
    """Calculate export size and time estimates using archive metadata."""

    if not config.loras:
        return ExportEstimate(size="0 Bytes", time="0 seconds")

    estimation = archive_service.estimate_adapter_export()
    return ExportEstimate(
        size=_format_size(estimation.total_bytes),
        time=_format_duration(estimation.estimated_seconds),
    )


@router.post("/export")
async def export_data(
    config: ExportConfig,
    archive_service: ArchiveService = Depends(get_archive_service),  # noqa: B008
):
    """Stream an archive export of adapters using the archive helper."""

    if not config.loras:
        raise HTTPException(status_code=400, detail="LoRA export must be enabled")
    if config.format.lower() != "zip":
        raise HTTPException(status_code=400, detail="Only ZIP exports are supported")

    archive = archive_service.build_export_archive()
    filename = f"lora_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"

    return StreamingResponse(
        archive.iterator,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(archive.size),
        },
    )


@router.post("/import")
async def import_data(
    files: List[UploadFile] = File(...),
    config: str = Form(...),
    archive_service: ArchiveService = Depends(get_archive_service),  # noqa: B008
):
    """Import adapters from uploaded archives after validation."""

    try:
        parsed_config = ImportConfig.model_validate_json(config)
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=400, detail=f"Invalid config: {exc}") from exc

    if not files:
        raise HTTPException(status_code=400, detail="No files were provided for import")

    dry_run_modes = {"dry-run", "dryrun", "preview"}
    persist = parsed_config.mode.lower() not in dry_run_modes
    target_root = Path(settings.IMPORT_PATH or (Path.cwd() / "loras"))

    results = []
    success = True
    for upload in files:
        upload.file.seek(0)
        try:
            summary = archive_service.import_archive(
                upload.file,
                target_directory=target_root,
                persist=persist,
                validate=parsed_config.validate,
            )
        except ValueError as exc:
            success = False
            results.append(
                {
                    "file": upload.filename,
                    "status": "error",
                    "detail": str(exc),
                }
            )
            continue

        status = "validated" if not persist else "imported"
        results.append(
            {
                "file": upload.filename,
                "status": status,
                "created": summary.created,
                "updated": summary.updated,
                "adapters": summary.adapters,
            }
        )

    processed = sum(1 for item in results if item.get("status") != "error")
    return {
        "success": success,
        "processed_files": processed,
        "total_files": len(files),
        "results": results,
    }


@router.get("/backups/history")
async def get_backup_history() -> List[BackupHistoryItem]:
    """Get backup history."""
    # Mock backup history
    return [
        BackupHistoryItem(
            id="backup_001",
            created_at=datetime.now().isoformat(),
            type="Full Backup",
            size=1024 * 1024 * 100,  # 100MB
            status="completed",
        ),
        BackupHistoryItem(
            id="backup_002",
            created_at=datetime.now().isoformat(),
            type="Quick Backup",
            size=1024 * 1024 * 50,  # 50MB
            status="completed",
        ),
    ]


@router.post("/backup/create")
async def create_backup(backup_type: str = "full"):
    """Create a new backup."""
    return {
        "success": True,
        "backup_id": f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "type": backup_type,
        "status": "initiated",
    }


# ---------------------------------------------------------------------------
# Prefixed route aliases for `/import-export/*`
# ---------------------------------------------------------------------------
# Maintain backwards compatibility by exposing import/export endpoints with
# the expected `/import-export` prefix used by the frontend SPA. Legacy routes
# without the prefix remain available because the primary decorators above use
# the original paths.
router.add_api_route("/import-export/export", export_data, methods=["POST"])
router.add_api_route("/import-export/export/estimate", estimate_export, methods=["POST"])
router.add_api_route("/import-export/import", import_data, methods=["POST"])
router.add_api_route("/import-export/backups/history", get_backup_history, methods=["GET"])
router.add_api_route("/import-export/backup/create", create_backup, methods=["POST"])
