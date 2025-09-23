"""Thin façade coordinating archive planning and execution."""

from __future__ import annotations

import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Dict, Iterable, Iterator, Optional, Sequence

from backend.services.adapters import AdapterService
from backend.services.storage import StorageService

from .executor import ArchiveImportExecutor, ImportResult
from .planner import ArchiveExportPlanner, ExportEstimation


@dataclass
class ExportArchive:
    """Representation of a prepared export archive."""

    iterator: Iterable[bytes]
    manifest: Dict[str, Any]
    size: int


class ArchiveService:
    """Coordinate archive planning and import execution."""

    def __init__(
        self,
        adapter_service: AdapterService,
        storage_service: StorageService,
        *,
        planner: Optional[ArchiveExportPlanner] = None,
        executor: Optional[ArchiveImportExecutor] = None,
        chunk_size: int = 64 * 1024,
        spooled_file_max_size: int = 32 * 1024 * 1024,
    ) -> None:
        self._adapter_service = adapter_service
        self._chunk_size = chunk_size
        self._spooled_file_max_size = spooled_file_max_size
        self._planner = planner or ArchiveExportPlanner(adapter_service, storage_service)
        self._executor = executor or ArchiveImportExecutor(
            adapter_service, chunk_size=chunk_size,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def estimate_adapter_export(self, adapter_ids: Optional[Sequence[str]] = None) -> ExportEstimation:
        """Estimate archive size for adapters and approximate transfer time."""

        return self._planner.estimate(adapter_ids)

    def build_export_archive(self, adapter_ids: Optional[Sequence[str]] = None) -> ExportArchive:
        """Create a streaming archive for the selected adapters."""

        plan = self._planner.build_plan(adapter_ids)
        spool = tempfile.SpooledTemporaryFile(max_size=self._spooled_file_max_size)
        with zipfile.ZipFile(spool, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", plan.manifest_bytes)
            for metadata in plan.metadata_entries:
                archive.writestr(metadata.archive_path, metadata.payload)
            for file_entry in plan.file_entries:
                with open(file_entry.source_path, "rb") as source:
                    with archive.open(file_entry.archive_path, "w") as target:
                        shutil.copyfileobj(source, target, self._chunk_size)
        size = spool.tell()
        spool.seek(0)

        chunk_size = self._chunk_size

        def _iterator() -> Iterator[bytes]:
            try:
                while True:
                    chunk = spool.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                spool.close()

        return ExportArchive(iterator=_iterator(), manifest=plan.manifest, size=size)

    def import_archive(
        self,
        file_obj: BinaryIO,
        *,
        target_directory: Optional[Path | str] = None,
        persist: bool = True,
        validate: bool = True,
    ) -> ImportResult:
        """Load adapters from an archive into the database/storage backend."""

        return self._executor.execute(
            file_obj,
            target_directory=target_directory,
            persist=persist,
            validate=validate,
        )

    # ------------------------------------------------------------------
    # Testing helpers
    # ------------------------------------------------------------------
    @property
    def planner(self) -> ArchiveExportPlanner:
        """Expose the planner for testing purposes."""

        return self._planner

    @property
    def executor(self) -> ArchiveImportExecutor:
        """Expose the executor for testing purposes."""

        return self._executor
