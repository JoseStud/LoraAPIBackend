"""System-level service helpers for dashboard and monitoring endpoints."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import func, select

from backend.core.config import settings
from backend.core.gpu import detect_gpu, get_gpu_memory_info
from backend.delivery.sdnext_client import SDNextSession
from backend.models import Adapter
from backend.services.recommendations import RecommendationService

if TYPE_CHECKING:  # pragma: no cover
    from sqlmodel import Session

    from .deliveries import DeliveryService


def _bytes_to_gigabytes(value: Optional[int]) -> float:
    if not value or value <= 0:
        return 0.0
    return round(value / (1024**3), 1)


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
    memory_used_mb: int,
    memory_total_mb: int,
    gpu_info: Dict[str, Any],
) -> List[Dict[str, Any]]:
    if not gpu_info.get("available"):
        return []

    details = gpu_info.get("details", {})
    memory_total = memory_total_mb or _to_mebibytes(details.get("memory_total"))
    memory_used = memory_used_mb
    percent: Optional[int] = None
    if memory_total:
        percent = (
            min(100, max(0, round((memory_used / memory_total) * 100)))
            if memory_used
            else 0
        )

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
        """Return the summary as a serializable dictionary."""
        return {
            "status": self.status,
            "gpu_status": self.gpu_status,
            "gpu_memory": self.gpu_memory,
            "queue_status": self.queue_status,
            "storage_usage": self.storage_usage,
        }


class SystemService:
    """Service that aggregates system health metrics."""

    def __init__(
        self,
        delivery_service: "DeliveryService",
        *,
        queue_warning_active: Optional[int] = None,
        queue_warning_failed: Optional[int] = None,
        importer_stale_hours: Optional[int] = None,
    ) -> None:
        """Store the delivery service used to query queue statistics."""
        self._delivery_service = delivery_service
        self._queue_warning_active = queue_warning_active
        self._queue_warning_failed = queue_warning_failed
        self._importer_stale_hours = importer_stale_hours

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_db_session(self) -> Optional["Session"]:
        return getattr(self._delivery_service, "db_session", None)

    def _get_storage_usage_fallback(self) -> str:
        storage_path = settings.IMPORT_PATH or os.getcwd()
        try:
            usage = shutil.disk_usage(storage_path)
            used = _bytes_to_gigabytes(usage.used)
            total = _bytes_to_gigabytes(usage.total)
            return f"{used:.1f} GB / {total:.1f} GB"
        except (FileNotFoundError, PermissionError, OSError):
            return "unknown"

    async def _gather_sdnext_status(self) -> Dict[str, Any]:
        """Collect SDNext connectivity details using configured settings."""
        session = SDNextSession()
        configured = session.is_configured()
        status: Dict[str, Any] = {
            "configured": configured,
            "base_url": settings.SDNEXT_BASE_URL,
            "available": False,
            "error": None,
        }

        if not configured:
            await session.close()
            status["error"] = "SDNext base URL not configured"
            status["available"] = False
            return status

        try:
            available = await session.health_check()
        except Exception as exc:  # pragma: no cover - defensive guard
            status["available"] = False
            status["error"] = str(exc)
        else:
            status["available"] = bool(available)
            if not available:
                status["error"] = "Health check failed"
        finally:
            await session.close()

        status["checked_at"] = datetime.now(timezone.utc).isoformat()
        return status

    def _gather_importer_status(self) -> Dict[str, Any]:
        """Summarise importer activity based on adapter ingestion metadata."""
        session = self._get_db_session()
        status: Dict[str, Any] = {
            "import_path": settings.IMPORT_PATH,
            "last_ingested_at": None,
            "recent_imports": None,
            "total_adapters": None,
            "stale": None,
        }

        if session is None:
            return status

        timestamp_column = func.coalesce(
            Adapter.last_ingested_at, Adapter.updated_at, Adapter.created_at
        )

        last_ingested = session.exec(
            select(func.max(timestamp_column))
        ).scalar_one_or_none()
        total_adapters = session.exec(select(func.count(Adapter.id))).scalar_one()
        status["total_adapters"] = int(total_adapters or 0)

        if last_ingested:
            if isinstance(last_ingested, datetime):
                status["last_ingested_at"] = last_ingested.astimezone(
                    timezone.utc
                ).isoformat()
            else:  # pragma: no cover - defensive guard for non-datetime
                status["last_ingested_at"] = str(last_ingested)

        stale_threshold = self._importer_stale_hours or 0
        status["stale_threshold_hours"] = stale_threshold

        if stale_threshold and stale_threshold > 0:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=stale_threshold)
            recent_count = session.exec(
                select(func.count(Adapter.id)).where(timestamp_column >= cutoff)
            ).scalar_one()
            status["recent_imports"] = int(recent_count or 0)

            if status["last_ingested_at"] is None:
                status["stale"] = status["total_adapters"] > 0
            else:
                try:
                    parsed = datetime.fromisoformat(status["last_ingested_at"])
                except ValueError:  # pragma: no cover - defensive guard
                    status["stale"] = None
                else:
                    if status["recent_imports"]:
                        status["stale"] = False
                    else:
                        idle_duration = now - parsed
                        inactivity_window = timedelta(hours=stale_threshold * 2)
                        buffer = timedelta(minutes=5)
                        if stale_threshold >= 6:
                            buffer = max(buffer, timedelta(hours=1))
                        status["stale"] = idle_duration >= inactivity_window + buffer
        return status

    def _gather_recommendation_status(self) -> Dict[str, Any]:
        """Return recommendation subsystem runtime details."""
        models_loaded = RecommendationService.models_loaded()
        gpu_available = RecommendationService.is_gpu_available()
        return {
            "models_loaded": models_loaded,
            "gpu_available": gpu_available,
        }

    def _queue_thresholds(self) -> Dict[str, Any]:
        return {
            "active_warning": self._queue_warning_active,
            "failed_warning": self._queue_warning_failed,
        }

    async def get_system_status_payload(self) -> Dict[str, Any]:
        """Return the full system status payload consumed by API clients."""
        observed_at = datetime.now(timezone.utc).isoformat()

        gpu_info = detect_gpu()
        gpu_available = bool(gpu_info.get("available"))

        gpu_memory = get_gpu_memory_info() or {}
        memory_total_mb = _to_mebibytes(gpu_memory.get("total"))
        memory_used_mb = _to_mebibytes(gpu_memory.get("allocated"))

        if not memory_total_mb:
            memory_total_mb = _to_mebibytes(
                gpu_info.get("details", {}).get("memory_total")
            )
        if memory_used_mb > memory_total_mb:
            memory_total_mb = memory_used_mb

        queue_stats = self._delivery_service.get_queue_statistics()

        sdnext_status = await self._gather_sdnext_status()
        importer_status = self._gather_importer_status()
        recommendation_status = self._gather_recommendation_status()
        thresholds = self._queue_thresholds()

        warnings: List[str] = []
        status = "healthy"

        if not gpu_available:
            warnings.append("GPU unavailable; falling back to CPU execution")

        active_threshold = thresholds.get("active_warning")
        if (
            isinstance(active_threshold, int)
            and queue_stats["active"] > active_threshold
        ):
            warnings.append(
                "Queue backlog above threshold: "
                f"{queue_stats['active']} active > {active_threshold}"
            )

        failed_threshold = thresholds.get("failed_warning")
        if (
            isinstance(failed_threshold, int)
            and queue_stats["failed"] > failed_threshold
        ):
            warnings.append(
                "Delivery failures exceed threshold: "
                f"{queue_stats['failed']} failed > {failed_threshold}"
            )

        if sdnext_status.get("configured") and not sdnext_status.get("available"):
            error_message = sdnext_status.get("error") or "SDNext health check failed"
            warnings.append(f"SDNext backend unavailable: {error_message}")

        importer_stale = importer_status.get("stale")
        if importer_stale is True:
            hours = importer_status.get("stale_threshold_hours")
            if hours:
                warnings.append(f"Importer inactive for more than {int(hours)} hours")
            else:
                warnings.append("Importer inactivity detected")

        if not recommendation_status.get("models_loaded", True):
            warnings.append(
                "Recommendation models not preloaded; first requests may be slow"
            )

        if warnings:
            status = "warning"

        backend_name = "redis" if settings.REDIS_URL else "in-memory"

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
            "sdnext": sdnext_status,
            "importer": importer_status,
            "recommendations": recommendation_status,
            "queue": queue_stats,
            "thresholds": {
                "queue": thresholds,
                "importer": {
                    "stale_hours": self._importer_stale_hours,
                },
            },
        }

        return payload

    async def get_health_summary(self) -> SystemHealthSummary:
        """Compute a lightweight system health summary for dashboard views."""
        payload = await self.get_system_status_payload()

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
