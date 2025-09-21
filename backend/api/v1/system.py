"""System status API endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import os

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from backend.core.database import get_session
from backend.core.gpu import detect_gpu, get_gpu_memory_info
from backend.models.deliveries import DeliveryJob


router = APIRouter(prefix="/system", tags=["system"])


_ACTIVE_STATUSES = {"pending", "running", "retrying"}


def _to_mebibytes(value: Optional[int]) -> int:
    """Convert a value expressed in bytes to mebibytes."""

    if not value or value <= 0:
        return 0
    return int(value // (1024 * 1024))


def _gpu_status_label(gpu_info: Dict[str, Any]) -> str:
    if gpu_info.get("available"):
        details = gpu_info.get("details", {})
        name = details.get("device_name") or details.get("name")
        return name or "GPU available"
    return "GPU unavailable (CPU mode)"


def _collect_gpu_metrics(memory_used_mb: int, memory_total_mb: int, gpu_info: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not gpu_info.get("available"):
        return []

    details = gpu_info.get("details", {})
    memory_total = memory_total_mb or _to_mebibytes(details.get("memory_total"))
    memory_used = memory_used_mb
    percent = None
    if memory_total:
        percent = min(100, max(0, round((memory_used / memory_total) * 100))) if memory_used else 0

    gpu_entry: Dict[str, Any] = {
        "id": 0,
        "name": details.get("device_name") or details.get("name") or "GPU",
        "memory_total": memory_total,
        "memory_used": memory_used,
        "memory_percent": percent,
        "temperature": details.get("temperature"),
        "utilization": details.get("utilization"),
        "fan_speed": details.get("fan_speed"),
        "power_draw_watts": details.get("power_draw_watts"),
    }

    return [gpu_entry]


def _queue_length(session: Session) -> Dict[str, int]:
    """Return queue statistics derived from the DeliveryJob table."""

    total_jobs = session.exec(select(func.count(DeliveryJob.id))).first() or 0

    active_jobs = (
        session.exec(
            select(func.count(DeliveryJob.id)).where(DeliveryJob.status.in_(_ACTIVE_STATUSES)),
        ).first()
        or 0
    )

    running_jobs = (
        session.exec(
            select(func.count(DeliveryJob.id)).where(DeliveryJob.status == "running"),
        ).first()
        or 0
    )

    failed_jobs = (
        session.exec(
            select(func.count(DeliveryJob.id)).where(DeliveryJob.status == "failed"),
        ).first()
        or 0
    )

    return {
        "total": total_jobs,
        "active": active_jobs,
        "running": running_jobs,
        "failed": failed_jobs,
    }


def _system_metrics(gpu_metrics: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    try:
        import psutil  # type: ignore
    except Exception:
        return None

    try:
        virtual_memory = psutil.virtual_memory()
        disk = psutil.disk_usage(os.getcwd())
        cpu_percent = psutil.cpu_percent(interval=None)
        uptime_seconds = int(psutil.boot_time())
        now = int(datetime.now(timezone.utc).timestamp())
        uptime = now - uptime_seconds if uptime_seconds else None

        metrics: Dict[str, Any] = {
            "cpu_percent": int(cpu_percent),
            "memory_percent": int(getattr(virtual_memory, "percent", 0)),
            "memory_used": _to_mebibytes(getattr(virtual_memory, "used", 0)),
            "memory_total": _to_mebibytes(getattr(virtual_memory, "total", 0)),
            "disk_percent": int(getattr(disk, "percent", 0)) if disk else None,
            "disk_used": _to_mebibytes(getattr(disk, "used", 0)) if disk else None,
            "disk_total": _to_mebibytes(getattr(disk, "total", 0)) if disk else None,
            "gpus": gpu_metrics,
            "uptime_seconds": uptime,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return metrics
    except Exception:
        return None


@router.get("/status")
async def get_system_status(session: Session = Depends(get_session)) -> Dict[str, Any]:
    """Return a snapshot of system status and telemetry data."""

    observed_at = datetime.now(timezone.utc).isoformat()

    gpu_info = detect_gpu()
    gpu_available = bool(gpu_info.get("available"))

    gpu_memory = get_gpu_memory_info()
    memory_total_mb = _to_mebibytes(gpu_memory.get("total") if gpu_memory else None)
    memory_used_mb = _to_mebibytes(gpu_memory.get("allocated") if gpu_memory else None)

    if not memory_total_mb:
        memory_total_mb = _to_mebibytes(gpu_info.get("details", {}).get("memory_total"))
    if memory_used_mb > memory_total_mb:
        memory_total_mb = memory_used_mb

    queue_stats = _queue_length(session)

    warnings: List[str] = []
    status = "healthy"

    if not gpu_available:
        warnings.append("GPU unavailable; falling back to CPU execution")
        status = "warning"

    if queue_stats["active"] > 5:
        warnings.append("Queue backlog is growing")
        status = "warning"

    if queue_stats["failed"] > 0:
        warnings.append("There are failed delivery jobs pending review")
        status = "warning"

    backend_name = "redis" if os.getenv("REDIS_URL") else "in-memory"

    gpu_metrics = _collect_gpu_metrics(memory_used_mb, memory_total_mb, gpu_info)
    metrics = _system_metrics(gpu_metrics)

    if metrics and not memory_total_mb:
        memory_total_mb = metrics.get("memory_total", 0)
    if metrics and not memory_used_mb:
        memory_used_mb = metrics.get("memory_used", 0)

    payload: Dict[str, Any] = {
        "gpu_available": gpu_available,
        "queue_length": queue_stats["active"],
        "status": status,
        "gpu_status": _gpu_status_label(gpu_info),
        "memory_used": memory_used_mb,
        "memory_total": memory_total_mb or 0,
        "active_workers": queue_stats["running"],
        "backend": backend_name,
        "queue_eta_seconds": None,
        "last_updated": observed_at,
        "warnings": warnings,
        "metrics": metrics,
        "message": "System status collected successfully",
        "updated_at": observed_at,
    }

    return payload

