"""System-level service helpers for dashboard and monitoring endpoints."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from typing import TYPE_CHECKING, Dict, Optional

from backend.core.config import settings
from backend.core.gpu import detect_gpu, get_gpu_memory_info

if TYPE_CHECKING:  # pragma: no cover
    from .deliveries import DeliveryService


def _bytes_to_gigabytes(value: Optional[int]) -> float:
    if not value or value <= 0:
        return 0.0
    return round(value / (1024 ** 3), 1)


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

    def get_health_summary(self) -> SystemHealthSummary:
        """Compute a lightweight system health summary for dashboard views."""

        queue_stats = self._delivery_service.get_queue_statistics()
        gpu_info = detect_gpu()
        gpu_available = bool(gpu_info.get("available"))
        gpu_details = gpu_info.get("details", {})

        memory_info = get_gpu_memory_info() or {}
        used_bytes = memory_info.get("allocated") or gpu_details.get("memory_used")
        total_bytes = memory_info.get("total") or gpu_details.get("memory_total")

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

        queue_status = "active" if queue_stats["active"] else "idle"

        gpu_status_label = (
            gpu_details.get("device_name")
            or gpu_details.get("name")
            or ("GPU Available" if gpu_available else "GPU Unavailable")
        )

        health_status = "healthy"
        if not gpu_available or queue_stats["failed"]:
            health_status = "warning"

        storage_path = settings.IMPORT_PATH or os.getcwd()
        try:
            usage = shutil.disk_usage(storage_path)
            used = _bytes_to_gigabytes(usage.used)
            total = _bytes_to_gigabytes(usage.total)
            storage_usage = f"{used:.1f} GB / {total:.1f} GB"
        except (FileNotFoundError, PermissionError, OSError):
            storage_usage = "unknown"

        return SystemHealthSummary(
            status=health_status,
            gpu_status=gpu_status_label,
            gpu_memory=gpu_memory,
            queue_status=queue_status,
            storage_usage=storage_usage,
        )


__all__ = ["SystemService", "SystemHealthSummary"]
