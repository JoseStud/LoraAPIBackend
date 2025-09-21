"""Services for exporting and importing adapter archives."""

from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
import zipfile
"""Helper utilities for importing and exporting adapter archives."""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

from sqlmodel import select

from backend.models import Adapter
from backend.schemas.adapters import AdapterCreate
from backend.services.adapters import AdapterService
from backend.services.storage import StorageService


@dataclass
class ExportEstimation:
    """Summary of an export size/time estimate."""

    adapters: int
    total_bytes: int
    metadata_bytes: int
    file_bytes: int
    estimated_seconds: float


@dataclass
class ExportArchive:
    """Representation of a prepared export archive."""

    iterator: Iterable[bytes]
    manifest: Dict[str, Any]
    size: int


@dataclass
class ArchiveImportSummary:
    """Summary of an archive import operation."""

    manifest: Dict[str, Any]
    created: int
    updated: int
    adapters: List[Dict[str, Any]]


class ArchiveService:
    """Helper responsible for building and loading adapter archives."""

    def __init__(
        self,
        adapter_service: AdapterService,
        storage_service: StorageService,
        *,
        chunk_size: int = 64 * 1024,
        throughput_bytes_per_sec: int = 10 * 1024 * 1024,
        spooled_file_max_size: int = 32 * 1024 * 1024,
    ) -> None:
        self.adapter_service = adapter_service
        self.storage = storage_service
        self.chunk_size = chunk_size
        self.throughput_bytes_per_sec = throughput_bytes_per_sec
        self.spooled_file_max_size = spooled_file_max_size

    # ------------------------------------------------------------------
    # Export helpers
    # ------------------------------------------------------------------
    def estimate_adapter_export(
        self, adapter_ids: Optional[Sequence[str]] = None
    ) -> ExportEstimation:
        """Estimate archive size for adapters and approximate transfer time."""

        plan = self._build_export_plan(adapter_ids)
        total_bytes = plan["total_bytes"]
        metadata_bytes = plan["metadata_total_bytes"]
        file_bytes = plan["file_total_bytes"]
        adapters = len(plan["manifest"].get("adapters", []))
        estimated_seconds = (
            float(total_bytes) / float(self.throughput_bytes_per_sec)
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

    def build_export_archive(
        self, adapter_ids: Optional[Sequence[str]] = None
    ) -> ExportArchive:
        """Create a streaming archive for the selected adapters."""

        plan = self._build_export_plan(adapter_ids)
        spool = tempfile.SpooledTemporaryFile(max_size=self.spooled_file_max_size)
        with zipfile.ZipFile(spool, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", plan["manifest_bytes"])
            for metadata_path, payload in plan["metadata_entries"]:
                archive.writestr(metadata_path, payload)
            for file_entry in plan["file_entries"]:
                with open(file_entry["source_path"], "rb") as source:
                    with archive.open(file_entry["archive_path"], "w") as target:
                        shutil.copyfileobj(source, target, self.chunk_size)
        size = spool.tell()
        spool.seek(0)

        def _iterator() -> Iterator[bytes]:
            try:
                while True:
                    chunk = spool.read(self.chunk_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                spool.close()

        return ExportArchive(iterator=_iterator(), manifest=plan["manifest"], size=size)

    # ------------------------------------------------------------------
    # Import helpers
    # ------------------------------------------------------------------
    def import_archive(
        self,
        file_obj: BinaryIO,
        *,
        target_directory: Optional[Path | str] = None,
        persist: bool = True,
        validate: bool = True,
    ) -> ArchiveImportSummary:
        """Load adapters from an archive into the database/storage backend."""

        target_root = Path(target_directory) if target_directory else Path.cwd() / "loras"
        if persist:
            target_root.mkdir(parents=True, exist_ok=True)

        file_obj.seek(0)
        with zipfile.ZipFile(file_obj) as archive:
            manifest = self._load_manifest(archive)
            adapters_section = manifest.get("adapters", [])
            if not isinstance(adapters_section, list):
                raise ValueError("Manifest adapters section must be a list")
            members = set(archive.namelist())
            created = 0
            updated = 0
            adapter_results: List[Dict[str, Any]] = []
            for adapter_entry in adapters_section:
                if not isinstance(adapter_entry, dict):
                    raise ValueError("Manifest adapter entries must be objects")
                adapter_id = adapter_entry.get("id")
                metadata_path = adapter_entry.get("metadata_path")
                if not metadata_path:
                    raise ValueError(f"Adapter entry {adapter_id!r} missing metadata_path")
                try:
                    metadata_bytes = archive.read(metadata_path)
                except KeyError as exc:
                    raise ValueError(f"Metadata file missing: {metadata_path}") from exc
                try:
                    metadata_data = json.loads(metadata_bytes.decode("utf-8"))
                except json.JSONDecodeError as exc:
                    raise ValueError(f"Invalid metadata JSON for adapter {adapter_id}") from exc
                payload = AdapterCreate.model_validate(metadata_data)

                extracted: List[Tuple[Path, Dict[str, Any]]] = []
                files_section = adapter_entry.get("files", [])
                if not isinstance(files_section, list):
                    raise ValueError("Manifest files section must be a list")
                for file_info in files_section:
                    if not isinstance(file_info, dict):
                        raise ValueError("Manifest file entries must be objects")
                    if not file_info.get("exists"):
                        continue
                    archive_path = file_info.get("archive_path")
                    if not archive_path:
                        raise ValueError("Manifest file entry missing archive_path")
                    if validate and archive_path not in members:
                        raise ValueError(f"Archive missing declared file: {archive_path}")
                    if not persist:
                        continue
                    dest = self._extract_member(
                        archive,
                        archive_path,
                        target_root / str(adapter_id or payload.name),
                        file_info,
                    )
                    extracted.append((dest, file_info))

                status = "validated"
                if persist:
                    self._apply_extracted_paths(payload, extracted)
                    status = self._persist_adapter(payload)
                    if status == "created":
                        created += 1
                    elif status == "updated":
                        updated += 1
                adapter_results.append(
                    {
                        "id": adapter_id,
                        "name": payload.name,
                        "status": status,
                    }
                )

        file_obj.seek(0)
        return ArchiveImportSummary(
            manifest=manifest,
            created=created,
            updated=updated,
            adapters=adapter_results,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _build_export_plan(
        self, adapter_ids: Optional[Sequence[str]] = None
    ) -> Dict[str, Any]:
        adapters = self._load_adapters(adapter_ids)
        manifest_adapters: List[Dict[str, Any]] = []
        metadata_entries: List[Tuple[str, bytes]] = []
        file_entries: List[Dict[str, Any]] = []
        file_total_bytes = 0
        metadata_total_bytes = 0

        for adapter in adapters:
            metadata_payload = self._serialize_adapter(adapter)
            metadata_bytes = json.dumps(metadata_payload, indent=2).encode("utf-8")
            metadata_path = f"adapters/{adapter.id}/metadata.json"
            metadata_entries.append((metadata_path, metadata_bytes))
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
                    archive_path = f"adapters/{adapter.id}/files/{index}_{candidate['name']}"
                    manifest_entry["archive_path"] = archive_path
                    file_entries.append(
                        {
                            "archive_path": archive_path,
                            "source_path": candidate["path"],
                            "size": candidate["size"],
                            "kind": candidate["kind"],
                            "original_name": candidate["name"],
                        }
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
                }
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

        return {
            "manifest": manifest,
            "manifest_bytes": manifest_bytes,
            "metadata_entries": metadata_entries,
            "file_entries": file_entries,
            "file_total_bytes": file_total_bytes,
            "metadata_total_bytes": metadata_total_bytes,
            "total_bytes": total_bytes,
        }

    def _load_adapters(
        self, adapter_ids: Optional[Sequence[str]] = None
    ) -> List[Adapter]:
        session = self.adapter_service.db_session
        if adapter_ids:
            stmt = select(Adapter).where(Adapter.id.in_(adapter_ids))
        else:
            stmt = select(Adapter)
        return list(session.exec(stmt).all())

    def _gather_adapter_files(self, adapter: Adapter) -> List[Dict[str, Any]]:
        candidates: List[Tuple[Optional[str], str]] = [
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
            exists = self.storage.validate_file_path(path_value)
            size = 0
            if exists:
                size_value = self.storage.backend.get_file_size(path_value)
                size = int(size_value or 0)
            results.append(
                {
                    "path": normalized,
                    "name": Path(path_value).name,
                    "kind": kind,
                    "exists": bool(exists),
                    "size": size,
                }
            )
            seen.add(normalized)
        return results

    def _serialize_adapter(self, adapter: Adapter) -> Dict[str, Any]:
        adapter_dict = adapter.model_dump()
        allowed_keys = AdapterCreate.model_fields.keys()
        filtered = {key: adapter_dict.get(key) for key in allowed_keys}
        payload = AdapterCreate.model_validate(filtered)
        return payload.model_dump(mode="json", exclude_none=True)

    def _load_manifest(self, archive: zipfile.ZipFile) -> Dict[str, Any]:
        try:
            manifest_bytes = archive.read("manifest.json")
        except KeyError as exc:
            raise ValueError("Archive missing manifest.json") from exc
        try:
            manifest = json.loads(manifest_bytes.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid manifest JSON") from exc
        if not isinstance(manifest, dict):
            raise ValueError("Manifest must be a JSON object")
        if "adapters" not in manifest:
            raise ValueError("Manifest missing adapters section")
        return manifest

    def _extract_member(
        self,
        archive: zipfile.ZipFile,
        member_path: str,
        adapter_dir: Path,
        file_info: Dict[str, Any],
    ) -> Path:
        member = Path(member_path)
        if member.is_absolute() or ".." in member.parts:
            raise ValueError(f"Unsafe archive path detected: {member_path}")
        adapter_dir.mkdir(parents=True, exist_ok=True)
        original_name = file_info.get("original_name") or member.name
        safe_name = Path(original_name).name
        destination = adapter_dir / safe_name
        with archive.open(member_path) as source, destination.open("wb") as target:
            shutil.copyfileobj(source, target, self.chunk_size)
        return destination

    def _apply_extracted_paths(
        self,
        payload: AdapterCreate,
        extracted: List[Tuple[Path, Dict[str, Any]]],
    ) -> None:
        if not extracted:
            return
        primary_candidate: Optional[Tuple[Path, Dict[str, Any]]] = None
        metadata_candidate: Optional[Tuple[Path, Dict[str, Any]]] = None
        for path_obj, info in extracted:
            kind = info.get("kind")
            if kind in {"primary", "primary_local"} and primary_candidate is None:
                primary_candidate = (path_obj, info)
            if kind == "metadata" and metadata_candidate is None:
                metadata_candidate = (path_obj, info)

        if primary_candidate:
            primary_path = primary_candidate[0]
            payload.file_path = str(primary_path)
            payload.primary_file_local_path = str(primary_path)
            payload.primary_file_name = primary_path.name
            size_kb = max(1, math.ceil(primary_path.stat().st_size / 1024))
            payload.primary_file_size_kb = size_kb
        if metadata_candidate:
            metadata_path = metadata_candidate[0]
            payload.json_file_path = str(metadata_path)

    def _persist_adapter(self, payload: AdapterCreate) -> str:
        session = self.adapter_service.db_session
        stmt = select(Adapter).where(Adapter.name == payload.name)
        if payload.version is None:
            stmt = stmt.where(Adapter.version.is_(None))
        else:
            stmt = stmt.where(Adapter.version == payload.version)
        existing = session.exec(stmt).first()
        self.adapter_service.upsert_adapter(payload)
        return "updated" if existing else "created"
