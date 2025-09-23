"""Import execution helpers for archive workflows."""

from __future__ import annotations

import json
import math
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional, Tuple

from sqlmodel import select

from backend.models import Adapter
from backend.schemas.adapters import AdapterCreate
from backend.services.adapters import AdapterService


@dataclass
class ImportAdapterResult:
    """Per-adapter import result."""

    id: Optional[str]
    name: str
    status: str


@dataclass
class ImportResult:
    """Summary of an archive import operation."""

    manifest: Dict[str, Any]
    created: int
    updated: int
    adapters: List[ImportAdapterResult]


class ArchiveImportExecutor:
    """Extract archive payloads and persist them via the adapter service."""

    def __init__(
        self,
        adapter_service: AdapterService,
        *,
        chunk_size: int = 64 * 1024,
    ) -> None:
        self._adapter_service = adapter_service
        self._chunk_size = chunk_size

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def execute(
        self,
        file_obj: BinaryIO,
        *,
        target_directory: Optional[Path | str] = None,
        persist: bool = True,
        validate: bool = True,
    ) -> ImportResult:
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
            adapter_results: List[ImportAdapterResult] = []
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
                    ImportAdapterResult(id=adapter_id, name=payload.name, status=status),
                )

        file_obj.seek(0)
        return ImportResult(
            manifest=manifest,
            created=created,
            updated=updated,
            adapters=adapter_results,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
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
            shutil.copyfileobj(source, target, self._chunk_size)
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
        session = self._adapter_service.db_session
        stmt = select(Adapter).where(Adapter.name == payload.name)
        if payload.version is None:
            stmt = stmt.where(Adapter.version.is_(None))
        else:
            stmt = stmt.where(Adapter.version == payload.version)
        existing = session.exec(stmt).first()
        self._adapter_service.upsert_adapter(payload)
        return "updated" if existing else "created"
