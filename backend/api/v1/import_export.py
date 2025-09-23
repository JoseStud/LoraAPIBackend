"""Import/Export API endpoints backed by archive helpers."""

from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse

from backend.core.config import settings
from backend.core.dependencies import get_archive_service, get_backup_service
from backend.schemas.import_export import (
    BackupCreateRequest,
    BackupHistoryItem,
    ExportConfig,
    ExportEstimate,
    ImportConfig,
)
from backend.services.archive import ArchiveService, BackupService
from backend.utils import format_bytes, format_duration

router = APIRouter(tags=["import-export"])

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
        size=format_bytes(estimation.total_bytes),
        time=format_duration(estimation.estimated_seconds),
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
async def get_backup_history(
    backup_service: BackupService = Depends(get_backup_service),  # noqa: B008
) -> List[BackupHistoryItem]:
    """Get persisted backup history entries."""

    return backup_service.list_history()


@router.post("/backup/create")
async def create_backup(
    payload: BackupCreateRequest,
    backup_service: BackupService = Depends(get_backup_service),  # noqa: B008
):
    """Create a new backup and return the created metadata."""

    entry = backup_service.create_backup(payload.backup_type)
    return {
        "success": True,
        "backup_id": entry.id,
        "type": entry.type,
        "status": entry.status,
        "size": entry.size,
        "created_at": entry.created_at.isoformat(),
    }


@router.delete("/backups/{backup_id}", status_code=204)
async def delete_backup(
    backup_id: str,
    backup_service: BackupService = Depends(get_backup_service),  # noqa: B008
) -> Response:
    """Delete a backup entry and its archive."""

    removed = backup_service.delete_backup(backup_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Backup not found")
    return Response(status_code=204)


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
router.add_api_route("/import-export/backups/{backup_id}", delete_backup, methods=["DELETE"])
