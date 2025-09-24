"""Helpers for working with persisted generation result assets."""

from __future__ import annotations

import base64
import json
import mimetypes
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Iterable, Iterator, List, Optional, Sequence

from backend.models import DeliveryJob

from .delivery_repository import DeliveryJobRepository

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from .generation import GenerationCoordinator
    from .storage import StorageService


@dataclass
class ResultAsset:
    """Representation of a persisted generation asset."""

    filename: str
    content_type: str
    path: Optional[str] = None
    data: Optional[bytes] = None
    size: Optional[int] = None

    def iter_bytes(self, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        """Yield file content as chunks or a single in-memory blob."""

        if self.path:
            path = Path(self.path)
            with path.open("rb") as stream:
                while True:
                    chunk = stream.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            return

        if self.data is not None:
            yield self.data


@dataclass
class ResultArchive:
    """Streaming archive payload for exported generation results."""

    iterator: Iterable[bytes]
    manifest: Dict[str, Any]
    size: int
    filename: str


@dataclass
class ResultDownload:
    """Metadata describing a downloadable generation artifact."""

    filename: str
    content_type: str
    iterator: Iterable[bytes]
    size: Optional[int] = None


class DeliveryResultManager:
    """Encapsulate asset discovery, cleanup, and export behaviour."""

    def __init__(self, repository: DeliveryJobRepository) -> None:
        self._repository = repository

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
    def collect_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[ResultAsset]:
        """Collect assets referenced by ``job``'s persisted payloads."""

        params_payload, result_payload = self._load_payloads(job, coordinator)
        return self._extract_assets(job, result_payload, storage, params=params_payload)

    def remove_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[str]:
        """Remove any files referenced by ``job`` and return their paths."""

        removed: List[str] = []
        for asset in self.collect_assets(job, storage, coordinator=coordinator):
            if not asset.path:
                continue
            try:
                path = Path(asset.path)
                path.unlink(missing_ok=True)
                removed.append(asset.path)
            except OSError:  # pragma: no cover - best effort cleanup
                continue
        return removed

    def build_archive(
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

    def build_download(
        self,
        job: DeliveryJob,
        *,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        chunk_size: int = 64 * 1024,
    ) -> Optional[ResultDownload]:
        """Prepare a download payload for the primary asset of ``job``."""

        assets = self.collect_assets(job, storage, coordinator=coordinator)
        if not assets:
            return None

        primary = assets[0]
        if primary.path:
            path = Path(primary.path)
            if not storage.validate_file_path(primary.path):
                return None

            size: Optional[int] = primary.size
            if size is None:
                try:
                    size = path.stat().st_size
                except OSError:
                    size = None

            return ResultDownload(
                filename=primary.filename,
                content_type=primary.content_type,
                iterator=self._stream_path(path, chunk_size),
                size=size,
            )

        if primary.data is not None:
            data = primary.data
            return ResultDownload(
                filename=primary.filename,
                content_type=primary.content_type,
                iterator=self._stream_bytes(data),
                size=len(data),
            )

        return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_payloads(
        self,
        job: DeliveryJob,
        coordinator: Optional["GenerationCoordinator"],
    ) -> tuple[Dict[str, Any], Dict[str, Any]]:
        params_payload: Dict[str, Any] = {}
        result_payload: Dict[str, Any] = {}

        if coordinator is not None:
            serialized = coordinator.serialize_delivery_job(job)
            params_payload = self._extract_dict(serialized.get("params"))
            result_payload = self._extract_dict(serialized.get("result"))
        else:
            params_payload = self._extract_dict(self._repository.get_job_params(job))
            result_payload = self._extract_dict(self._repository.get_job_result(job))

        return params_payload, result_payload

    def _extract_assets(
        self,
        job: DeliveryJob,
        result_payload: Dict[str, Any],
        storage: "StorageService",
        *,
        params: Optional[Dict[str, Any]] = None,
    ) -> List[ResultAsset]:
        assets: List[ResultAsset] = []
        seen_paths: set[str] = set()

        params = params or {}
        return_format = self._resolve_return_format(params)

        images = result_payload.get("images")
        if isinstance(images, list):
            assets.extend(
                self._collect_image_assets(
                    job,
                    images,
                    storage,
                    return_format,
                    seen_paths,
                )
            )

        for key in ("image_url", "thumbnail_url"):
            value = result_payload.get(key)
            asset = self._resolve_asset_value(
                value,
                storage,
                default_filename=f"{job.id}-{key}.png",
                return_format=return_format,
            )
            if asset is None:
                continue
            if asset.path and asset.path in seen_paths:
                continue
            if asset.path:
                seen_paths.add(asset.path)
            assets.append(asset)

        return assets

    def _collect_image_assets(
        self,
        job: DeliveryJob,
        images: List[Any],
        storage: "StorageService",
        return_format: Optional[str],
        seen_paths: set[str],
    ) -> List[ResultAsset]:
        collected: List[ResultAsset] = []
        for index, value in enumerate(images):
            asset = self._resolve_asset_value(
                value,
                storage,
                default_filename=f"{job.id}-{index:03d}.png",
                return_format=return_format,
            )
            if asset is None:
                continue
            if asset.path:
                if asset.path in seen_paths:
                    continue
                seen_paths.add(asset.path)
            collected.append(asset)
        return collected

    def _resolve_asset_value(
        self,
        value: Any,
        storage: "StorageService",
        *,
        default_filename: str,
        return_format: Optional[str] = None,
        fallback_mime: str = "image/png",
    ) -> Optional[ResultAsset]:
        if not isinstance(value, str):
            return None

        candidate = value.strip()
        if not candidate:
            return None

        if candidate.startswith("data:"):
            return self._decode_data_uri(candidate, default_filename, fallback_mime)

        normalized_format = (return_format or "").lower()
        path_candidate: Optional[str] = None

        if candidate.startswith("file://"):
            path_candidate = candidate[len("file://") :]
        elif normalized_format in {"file_path", "url"}:
            path_candidate = candidate

        if path_candidate is not None:
            return self._build_file_asset(path_candidate, default_filename, fallback_mime, storage)

        return self._decode_base64_blob(candidate, default_filename, fallback_mime)

    def _decode_data_uri(
        self,
        payload: str,
        default_filename: str,
        fallback_mime: str,
    ) -> Optional[ResultAsset]:
        header, _, body = payload.partition(",")
        mime = fallback_mime
        prefix = header[5:] if header.startswith("data:") else ""
        if ";" in prefix:
            mime = prefix.split(";", 1)[0] or fallback_mime
        elif prefix:
            mime = prefix
        try:
            binary = base64.b64decode(body, validate=False)
        except Exception:  # pragma: no cover - invalid payload
            return None
        return ResultAsset(
            filename=default_filename,
            content_type=mime or fallback_mime,
            data=binary,
            size=len(binary),
        )

    def _build_file_asset(
        self,
        path_candidate: str,
        default_filename: str,
        fallback_mime: str,
        storage: "StorageService",
    ) -> ResultAsset:
        filename = Path(path_candidate).name or default_filename
        mime_type, _ = mimetypes.guess_type(path_candidate)
        size_value: Optional[int] = None
        try:
            exists = storage.validate_file_path(path_candidate)
        except Exception:  # pragma: no cover - defensive guard
            exists = False

        if exists:
            file_info = storage.get_file_info(path_candidate) or {}
            if isinstance(file_info, dict):
                size_raw = file_info.get("size")
                if isinstance(size_raw, int):
                    size_value = size_raw
                elif isinstance(size_raw, float):
                    size_value = int(size_raw)

        return ResultAsset(
            filename=filename,
            content_type=mime_type or fallback_mime,
            path=path_candidate,
            size=size_value,
        )

    def _decode_base64_blob(
        self,
        payload: str,
        default_filename: str,
        fallback_mime: str,
    ) -> Optional[ResultAsset]:
        try:
            binary = base64.b64decode(payload, validate=False)
        except Exception:  # pragma: no cover - invalid base64
            return None

        return ResultAsset(
            filename=default_filename,
            content_type=fallback_mime,
            data=binary,
            size=len(binary),
        )

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
        params_payload, result_payload = self._load_payloads(job, coordinator)
        assets = self._extract_assets(job, result_payload, storage, params=params_payload)
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
        asset_entries = self._write_asset_entries(archive, base_path, assets, chunk_size)

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
                if asset.path:
                    path = Path(asset.path)
                    with path.open("rb") as source:
                        shutil.copyfileobj(source, target, chunk_size)
                elif asset.data is not None:
                    target.write(asset.data)
                else:
                    return False
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
    ) -> Iterator[bytes]:
        try:
            while True:
                chunk = spool.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            spool.close()

    def _stream_path(self, path: Path, chunk_size: int) -> Iterator[bytes]:
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def _stream_bytes(self, data: bytes) -> Iterator[bytes]:
        yield data

    @staticmethod
    def _extract_dict(value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        return {}

    @staticmethod
    def _resolve_return_format(params: Dict[str, Any]) -> Optional[str]:
        maybe_format = params.get("return_format") if isinstance(params, dict) else None
        if isinstance(maybe_format, str):
            return maybe_format.lower()
        return None

    @staticmethod
    def _json_default(value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)


__all__ = [
    "DeliveryResultManager",
    "ResultArchive",
    "ResultAsset",
    "ResultDownload",
]

