"""Builders that assemble streaming archives for delivery results."""

from __future__ import annotations

import json
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional, Sequence

from backend.models import DeliveryJob

from ..delivery_repository import DeliveryJobRepository
from .asset_resolver import ResultAssetResolver
from .models import ResultArchive, ResultAsset

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from ..generation import GenerationCoordinator
    from ..storage import StorageService


class ResultArchiveBuilder:
    """Create zipped exports for a collection of delivery results."""

    def __init__(
        self,
        repository: DeliveryJobRepository,
        asset_resolver: ResultAssetResolver,
    ) -> None:
        self._repository = repository
        self._assets = asset_resolver

    def build(
        self,
        job_ids: Sequence[str],
        *,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        include_metadata: bool = True,
        chunk_size: int = 64 * 1024,
        spooled_file_max_size: int = 32 * 1024 * 1024,
    ) -> Optional[ResultArchive]:
        """Create a streaming archive for the specified results."""
        jobs = self._repository.list_jobs_by_ids(job_ids)
        if not jobs:
            return None

        generated_at = datetime.now(timezone.utc)
        manifest = self._build_manifest_header(generated_at, len(jobs))
        spool = tempfile.SpooledTemporaryFile(max_size=spooled_file_max_size)

        with zipfile.ZipFile(spool, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for job in jobs:
                manifest_entry = self._add_job_to_archive(
                    archive,
                    job,
                    storage,
                    coordinator,
                    include_metadata=include_metadata,
                    chunk_size=chunk_size,
                )
                manifest["results"].append(manifest_entry)

        size = spool.tell()
        spool.seek(0)
        filename = f"generation-results-{generated_at.strftime('%Y%m%d-%H%M%S')}.zip"

        return ResultArchive(
            iterator=self._stream_spooled_file(spool, chunk_size),
            manifest=manifest,
            size=size,
            filename=filename,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _add_job_to_archive(
        self,
        archive: zipfile.ZipFile,
        job: DeliveryJob,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        *,
        include_metadata: bool,
        chunk_size: int,
    ) -> Dict[str, Any]:
        params_payload, result_payload, assets = self._assets.collect_with_payloads(
            job,
            storage,
            coordinator=coordinator,
        )
        base_path = f"results/{job.id}"

        metadata_payload: Dict[str, Any] = {
            "id": job.id,
            "prompt": job.prompt,
            "status": job.status,
            "created_at": job.created_at,
            "finished_at": job.finished_at,
        }
        if include_metadata:
            metadata_payload["params"] = params_payload
            metadata_payload["result"] = result_payload

        self._write_metadata_entry(archive, base_path, metadata_payload)
        asset_entries = self._write_asset_entries(
            archive, base_path, assets, chunk_size
        )

        return {
            "id": job.id,
            "prompt": job.prompt,
            "status": job.status,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "assets": asset_entries,
        }

    def _write_metadata_entry(
        self,
        archive: zipfile.ZipFile,
        base_path: str,
        metadata_payload: Dict[str, Any],
    ) -> None:
        archive.writestr(
            f"{base_path}/metadata.json",
            json.dumps(metadata_payload, indent=2, default=self._json_default),
        )

    def _write_asset_entries(
        self,
        archive: zipfile.ZipFile,
        base_path: str,
        assets: Sequence[ResultAsset],
        chunk_size: int,
    ) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        for index, asset in enumerate(assets):
            archive_name = f"{base_path}/{index:03d}_{asset.filename}"
            entry = {
                "filename": asset.filename,
                "archive_path": archive_name,
                "content_type": asset.content_type,
                "size": asset.size,
            }

            if self._write_single_asset(archive, archive_name, asset, chunk_size):
                entries.append(entry)

        return entries

    def _write_single_asset(
        self,
        archive: zipfile.ZipFile,
        archive_name: str,
        asset: ResultAsset,
        chunk_size: int,
    ) -> bool:
        try:
            with archive.open(archive_name, "w") as target:
                for chunk in asset.iter_bytes(chunk_size):
                    target.write(chunk)
        except OSError:
            return False

        return True

    def _build_manifest_header(
        self,
        generated_at: datetime,
        count: int,
    ) -> Dict[str, Any]:
        return {
            "generated_at": generated_at.isoformat(),
            "count": count,
            "results": [],
        }

    def _stream_spooled_file(
        self,
        spool: tempfile.SpooledTemporaryFile,
        chunk_size: int,
    ) -> Iterable[bytes]:
        try:
            while True:
                chunk = spool.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            spool.close()

    @staticmethod
    def _json_default(value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)


__all__ = ["ResultArchiveBuilder"]
