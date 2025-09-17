"""Import/Export API endpoints."""

import io
import json
import zipfile
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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


@router.post("/export/estimate")
async def estimate_export(config: ExportConfig) -> ExportEstimate:
    """Calculate export size and time estimates."""
    size_bytes = 0
    time_minutes = 0
    
    if config.loras:
        size_bytes += 10 * 1024 * 1024  # 10MB for metadata
        time_minutes += 2
        
        if config.lora_files:
            size_bytes += 500 * 1024 * 1024  # 500MB for model files
            time_minutes += 10
            
        if config.lora_embeddings:
            size_bytes += 100 * 1024 * 1024  # 100MB for embeddings
            time_minutes += 3
    
    if config.generations:
        if config.generation_range == "all":
            size_bytes += 200 * 1024 * 1024  # 200MB
            time_minutes += 5
        else:
            size_bytes += 50 * 1024 * 1024  # 50MB for date range
            time_minutes += 2
    
    if config.user_data:
        size_bytes += 5 * 1024 * 1024  # 5MB
        time_minutes += 1
    
    if config.system_config:
        size_bytes += 1 * 1024 * 1024  # 1MB
        time_minutes += 1
    
    if config.analytics:
        size_bytes += 20 * 1024 * 1024  # 20MB
        time_minutes += 2
    
    # Apply compression
    compression_ratio = {
        'none': 1.0,
        'fast': 0.7,
        'balanced': 0.5,
        'maximum': 0.3,
    }[config.compression]
    
    size_bytes *= compression_ratio
    
    def format_file_size(bytes_val):
        if bytes_val == 0:
            return '0 Bytes'
        k = 1024
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        i = len(sizes) - 1
        while i >= 0:
            if bytes_val >= k ** i:
                break
            i -= 1
        return f"{round(bytes_val / (k ** i), 2)} {sizes[i]}"
    
    return ExportEstimate(
        size=format_file_size(size_bytes),
        time=f"{max(1, round(time_minutes))} minutes",
    )


@router.post("/export")
async def export_data(config: ExportConfig):
    """Export data based on configuration."""
    # Create a mock export file
    output = io.BytesIO()
    
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add export metadata
        export_info = {
            "export_date": datetime.now().isoformat(),
            "config": config.dict(),
            "version": "2.1.0",
        }
        zip_file.writestr("export_info.json", json.dumps(export_info, indent=2))
        
        # Add mock data based on configuration
        if config.loras:
            zip_file.writestr("loras/metadata.json", json.dumps({"loras": []}, indent=2))
            if config.lora_files:
                zip_file.writestr("loras/models/README.txt", "LoRA model files would be here")
        
        if config.generations:
            zip_file.writestr("generations/data.json", json.dumps({"generations": []}, indent=2))
        
        if config.user_data:
            zip_file.writestr("user/preferences.json", json.dumps({"preferences": {}}, indent=2))
        
        if config.system_config:
            zip_file.writestr("system/config.json", json.dumps({"config": {}}, indent=2))
        
        if config.analytics:
            zip_file.writestr("analytics/metrics.json", json.dumps({"metrics": {}}, indent=2))
    
    output.seek(0)
    
    filename = f"lora_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    
    return StreamingResponse(
        io.BytesIO(output.read()),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import")
async def import_data(
    files: List[UploadFile] = File(...),
    config: str = Form(...),
):
    """Import data from uploaded files."""
    try:
        ImportConfig.parse_raw(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config: {str(e)}")
    
    results = []
    
    for file in files:
        # Validate file type
        valid_extensions = ['.zip', '.tar.gz', '.json', '.lora', '.safetensors']
        file_ext = ''.join(file.filename.split('.')[-2:]) if file.filename.endswith('.tar.gz') else f".{file.filename.split('.')[-1]}"
        
        if file_ext not in valid_extensions:
            results.append({
                "file": file.filename,
                "status": "skipped",
                "reason": "Unsupported file type",
            })
            continue
        
        # Process file (mock implementation)
        content = await file.read()
        
        results.append({
            "file": file.filename,
            "status": "processed",
            "size": len(content),
            "items_imported": 1 if file_ext == '.json' else 0,
        })
    
    return {
        "success": True,
        "processed_files": len([r for r in results if r["status"] == "processed"]),
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
