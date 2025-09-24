"""Export planning helpers for archive workflows."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from sqlmodel import select

from backend.models import Adapter
from backend.schemas.adapters import AdapterCreate
from backend.services.adapters import AdapterService
from backend.services.storage import StorageService


@dataclass
class MetadataEntry:
    """Metadata payload destined for the archive."""

    archive_path: str
    payload: bytes


@dataclass
class PlannedFile:
    """Description of a file that should be embedded in the archive."""

    archive_path: str
    source_path: str
    size: int
    kind: str
    original_name: str


@dataclass
class ExportPlan:
    """Complete manifest and payload description for an export."""

    manifest: Dict[str, Any]
    manifest_bytes: bytes
    metadata_entries: List[MetadataEntry]
    file_entries: List[PlannedFile]
    file_total_bytes: int
    metadata_total_bytes: int
    total_bytes: int


@dataclass
class ExportEstimation:
    """Summary of an export size/time estimate."""

    adapters: int
    total_bytes: int
    metadata_bytes: int
    file_bytes: int
    estimated_seconds: float


class ArchiveExportPlanner:
    """Plan archive manifests and payload metadata for adapter exports."""

    def __init__(
        self,
        adapter_service: AdapterService,
        storage_service: StorageService,
        *,
        throughput_bytes_per_sec: int = 10 * 1024 * 1024,
    ) -> None:
        self._adapter_service = adapter_service
        self._storage = storage_service
        self._throughput_bytes_per_sec = throughput_bytes_per_sec

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def build_plan(self, adapter_ids: Optional[Sequence[str]] = None) -> ExportPlan:
        """Construct the manifest and payload plan for selected adapters."""
        adapters = self._load_adapters(adapter_ids)
        manifest_adapters: List[Dict[str, Any]] = []
        metadata_entries: List[MetadataEntry] = []
        file_entries: List[PlannedFile] = []
        file_total_bytes = 0
        metadata_total_bytes = 0

        for adapter in adapters:
            metadata_payload = self._serialize_adapter(adapter)
            metadata_bytes = json.dumps(metadata_payload, indent=2).encode("utf-8")
            metadata_path = f"adapters/{adapter.id}/metadata.json"
            metadata_entries.append(
                MetadataEntry(archive_path=metadata_path, payload=metadata_bytes)
            )
            metadata_total_bytes += len(metadata_bytes)

            files_manifest: List[Dict[str, Any]] = []
            for index, candidate in enumerate(self._gather_adapter_files(adapter)):
                manifest_entry = {
                    "kind": candidate["kind"],
                    "original_path": candidate["path"],
                    "original_name": candidate["name"],
                    "exists": candidate["exists"],
                    "size": candidate["size"],
                }
                if candidate["exists"]:
                    archive_path = (
                        f"adapters/{adapter.id}/files/{index}_{candidate['name']}"
                    )
                    manifest_entry["archive_path"] = archive_path
                    file_entries.append(
                        PlannedFile(
                            archive_path=archive_path,
                            source_path=candidate["path"],
                            size=candidate["size"],
                            kind=candidate["kind"],
                            original_name=candidate["name"],
                        ),
                    )
                    file_total_bytes += candidate["size"]
                files_manifest.append(manifest_entry)

            manifest_adapters.append(
                {
                    "id": adapter.id,
                    "name": adapter.name,
                    "version": adapter.version,
                    "metadata_path": metadata_path,
                    "files": files_manifest,
                },
            )

        manifest = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "adapter_count": len(manifest_adapters),
            "file_total_bytes": file_total_bytes,
            "metadata_total_bytes": metadata_total_bytes,
            "total_bytes": file_total_bytes + metadata_total_bytes,
            "adapters": manifest_adapters,
        }
        manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
        metadata_total_bytes += len(manifest_bytes)
        total_bytes = file_total_bytes + metadata_total_bytes
        manifest["metadata_total_bytes"] = metadata_total_bytes
        manifest["total_bytes"] = total_bytes

        return ExportPlan(
            manifest=manifest,
            manifest_bytes=manifest_bytes,
            metadata_entries=metadata_entries,
            file_entries=file_entries,
            file_total_bytes=file_total_bytes,
            metadata_total_bytes=metadata_total_bytes,
            total_bytes=total_bytes,
        )

    def estimate(self, adapter_ids: Optional[Sequence[str]] = None) -> ExportEstimation:
        """Return a summarized size/time estimation for adapters."""
        plan = self.build_plan(adapter_ids)
        total_bytes = plan.total_bytes
        metadata_bytes = plan.metadata_total_bytes
        file_bytes = plan.file_total_bytes
        adapters = len(plan.manifest.get("adapters", []))
        estimated_seconds = (
            float(total_bytes) / float(self._throughput_bytes_per_sec)
            if total_bytes
            else 0.0
        )
        return ExportEstimation(
            adapters=adapters,
            total_bytes=total_bytes,
            metadata_bytes=metadata_bytes,
            file_bytes=file_bytes,
            estimated_seconds=estimated_seconds,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_adapters(
        self, adapter_ids: Optional[Sequence[str]] = None
    ) -> List[Adapter]:
        session = self._adapter_service.db_session
        if adapter_ids:
            stmt = select(Adapter).where(Adapter.id.in_(adapter_ids))
        else:
            stmt = select(Adapter)
        return list(session.exec(stmt).all())

    def _gather_adapter_files(self, adapter: Adapter) -> List[Dict[str, Any]]:
        candidates: List[tuple[Optional[str], str]] = [
            (adapter.file_path, "primary"),
            (adapter.primary_file_local_path, "primary_local"),
            (adapter.json_file_path, "metadata"),
        ]
        results: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for path_value, kind in candidates:
            if not path_value:
                continue
            normalized = os.path.abspath(path_value)
            if normalized in seen:
                continue
            exists = self._storage.validate_file_path(path_value)
            size = 0
            if exists:
                size_value = self._storage.backend.get_file_size(path_value)
                size = int(size_value or 0)
            results.append(
                {
                    "path": normalized,
                    "name": Path(path_value).name,
                    "kind": kind,
                    "exists": bool(exists),
                    "size": size,
                },
            )
            seen.add(normalized)
        return results

    def _serialize_adapter(self, adapter: Adapter) -> Dict[str, Any]:
        adapter_dict = adapter.model_dump()
        allowed_keys = AdapterCreate.model_fields.keys()
        filtered = {key: adapter_dict.get(key) for key in allowed_keys}
        payload = AdapterCreate.model_validate(filtered)
        return payload.model_dump(mode="json", exclude_none=True)
