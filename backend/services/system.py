"""System-level service helpers for dashboard and monitoring endpoints."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from backend.core.config import settings
from backend.core.gpu import detect_gpu, get_gpu_memory_info

if TYPE_CHECKING:  # pragma: no cover
    from .deliveries import DeliveryService


def _bytes_to_gigabytes(value: Optional[int]) -> float:
    if not value or value <= 0:
        return 0.0
    return round(value / (1024 ** 3), 1)


def _to_mebibytes(value: Optional[int]) -> int:
    if not value or value <= 0:
        return 0
    return int(value // (1024 * 1024))


def _megabytes_to_bytes(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    return int(value) * 1024 * 1024


def _gpu_status_label(gpu_info: Dict[str, Any]) -> str:
    if gpu_info.get("available"):
        details = gpu_info.get("details", {})
        name = details.get("device_name") or details.get("name")
        return name or "GPU available"
    return "GPU unavailable (CPU mode)"


def _collect_gpu_metrics(
    memory_used_mb: int, memory_total_mb: int, gpu_info: Dict[str, Any]
) -> List[Dict[str, Any]]:
    if not gpu_info.get("available"):
        return []

    details = gpu_info.get("details", {})
    memory_total = memory_total_mb or _to_mebibytes(details.get("memory_total"))
    memory_used = memory_used_mb
    percent: Optional[int] = None
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


def _system_metrics(gpu_metrics: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    try:
        import psutil  # type: ignore
    except Exception:  # pragma: no cover - psutil optional dependency
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
    except Exception:  # pragma: no cover - psutil failures should not crash
        return None


@dataclass
class SystemHealthSummary:
    """Structured summary of system health for the dashboard."""

    status: str
    gpu_status: str
    gpu_memory: str
    queue_status: str
    storage_usage: str

    def as_dict(self) -> Dict[str, str]:
        return {
            "status": self.status,
            "gpu_status": self.gpu_status,
            "gpu_memory": self.gpu_memory,
            "queue_status": self.queue_status,
            "storage_usage": self.storage_usage,
        }


class SystemService:
    """Service that aggregates system health metrics."""

    def __init__(self, delivery_service: "DeliveryService") -> None:
        self._delivery_service = delivery_service

    def _get_storage_usage_fallback(self) -> str:
        storage_path = settings.IMPORT_PATH or os.getcwd()
        try:
            usage = shutil.disk_usage(storage_path)
            used = _bytes_to_gigabytes(usage.used)
            total = _bytes_to_gigabytes(usage.total)
            return f"{used:.1f} GB / {total:.1f} GB"
        except (FileNotFoundError, PermissionError, OSError):
            return "unknown"

    def get_system_status_payload(self) -> Dict[str, Any]:
        """Return the full system status payload consumed by API clients."""

        observed_at = datetime.now(timezone.utc).isoformat()

        gpu_info = detect_gpu()
        gpu_available = bool(gpu_info.get("available"))

        gpu_memory = get_gpu_memory_info() or {}
        memory_total_mb = _to_mebibytes(gpu_memory.get("total"))
        memory_used_mb = _to_mebibytes(gpu_memory.get("allocated"))

        if not memory_total_mb:
            memory_total_mb = _to_mebibytes(gpu_info.get("details", {}).get("memory_total"))
        if memory_used_mb > memory_total_mb:
            memory_total_mb = memory_used_mb

        queue_stats = self._delivery_service.get_queue_statistics()

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

        if metrics:
            metrics_total = metrics.get("memory_total")
            metrics_used = metrics.get("memory_used")
            if not memory_total_mb and metrics_total:
                memory_total_mb = int(metrics_total)
            if not memory_used_mb and metrics_used:
                memory_used_mb = int(metrics_used)

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

    def get_health_summary(self) -> SystemHealthSummary:
        """Compute a lightweight system health summary for dashboard views."""

        payload = self.get_system_status_payload()

        used_bytes = _megabytes_to_bytes(payload.get("memory_used"))
        total_bytes = _megabytes_to_bytes(payload.get("memory_total"))

        used_gb = _bytes_to_gigabytes(used_bytes)
        total_gb = _bytes_to_gigabytes(total_bytes)
        if total_gb and used_gb > total_gb:
            total_gb = used_gb

        if total_gb:
            gpu_memory = f"{used_gb:.1f} GB / {total_gb:.1f} GB"
        elif used_gb:
            gpu_memory = f"{used_gb:.1f} GB"
        else:
            gpu_memory = "0.0 GB"

        queue_status = "active" if payload["queue_length"] else "idle"

        metrics = payload.get("metrics") or {}
        disk_used = metrics.get("disk_used")
        disk_total = metrics.get("disk_total")
        if disk_used is not None and disk_total:
            disk_used_gb = _bytes_to_gigabytes(_megabytes_to_bytes(int(disk_used)))
            disk_total_gb = _bytes_to_gigabytes(_megabytes_to_bytes(int(disk_total)))
            if disk_total_gb:
                storage_usage = f"{disk_used_gb:.1f} GB / {disk_total_gb:.1f} GB"
            else:
                storage_usage = f"{disk_used_gb:.1f} GB"
        else:
            storage_usage = self._get_storage_usage_fallback()

        return SystemHealthSummary(
            status=payload["status"],
            gpu_status=payload["gpu_status"],
            gpu_memory=gpu_memory,
            queue_status=queue_status,
            storage_usage=storage_usage,
        )


__all__ = ["SystemService", "SystemHealthSummary"]
