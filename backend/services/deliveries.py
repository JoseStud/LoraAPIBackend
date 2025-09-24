"""Delivery service for managing delivery jobs and queue hand-off."""

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

from fastapi import BackgroundTasks

from backend.models import DeliveryJob

from .delivery_repository import DeliveryJobRepository


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


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from .generation import GenerationCoordinator
    from .queue import QueueOrchestrator
    from .storage import StorageService


class DeliveryService:
    """Service for delivery job operations."""

    def __init__(
        self,
        repository: DeliveryJobRepository,
        queue_orchestrator: Optional["QueueOrchestrator"] = None,
    ) -> None:
        self._repository = repository
        self._queue_orchestrator = queue_orchestrator

    @property
    def repository(self) -> DeliveryJobRepository:
        return self._repository

    @property
    def queue_orchestrator(self) -> Optional["QueueOrchestrator"]:
        return self._queue_orchestrator

    @property
    def db_session(self):
        """Expose the active database session used by the repository."""
        return self._repository.session

    def set_queue_orchestrator(self, orchestrator: Optional["QueueOrchestrator"]) -> None:
        """Configure or replace the queue orchestrator."""
        self._queue_orchestrator = orchestrator

    def schedule_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> DeliveryJob:
        """Create a delivery job and enqueue it for processing."""
        job = self.create_job(prompt, mode, params or {})
        self.enqueue_job(job.id, background_tasks=background_tasks, **enqueue_kwargs)
        return job

    def enqueue_job(
        self,
        job_id: str,
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        **enqueue_kwargs: Any,
    ) -> None:
        """Enqueue an existing job using the configured queue orchestrator."""
        orchestrator = self._require_orchestrator()
        orchestrator.enqueue_delivery(
            job_id,
            background_tasks=background_tasks,
            **enqueue_kwargs,
        )

    def create_job(
        self,
        prompt: str,
        mode: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> DeliveryJob:
        """Create and persist a DeliveryJob record."""
        return self._repository.create_job(prompt, mode, params or {})

    def get_job(self, job_id: str) -> Optional[DeliveryJob]:
        """Get a delivery job by ID."""
        return self._repository.get_job(job_id)

    def list_jobs(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DeliveryJob]:
        """List delivery jobs with optional filtering and pagination."""
        return self._repository.list_jobs(status=status, limit=limit, offset=offset)

    def count_active_jobs(self) -> int:
        """Return the number of jobs currently in flight."""
        return self._repository.count_active_jobs()

    def get_queue_statistics(self) -> Dict[str, int]:
        """Return queue statistics derived from the delivery jobs table."""
        return self._repository.get_queue_statistics()

    def get_recent_activity(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return a recent activity feed derived from delivery jobs."""
        return self._repository.get_recent_activity(limit=limit)

    def update_job_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[DeliveryJob]:
        """Update a delivery job's status and result."""
        return self._repository.update_job_status(
            job_id,
            status,
            result=result,
            error=error,
        )

    def get_job_params(self, job: DeliveryJob) -> Dict[str, Any]:
        """Parse and return job parameters as dict."""
        return self._repository.get_job_params(job)

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict[str, Any]]:
        """Parse and return job result as dict."""
        return self._repository.get_job_result(job)

    # ------------------------------------------------------------------
    # Result management helpers
    # ------------------------------------------------------------------
    def delete_job_result(
        self,
        job_id: str,
        *,
        storage: "StorageService",
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> bool:
        """Remove a persisted result and delete the associated job record."""
        job = self.get_job(job_id)
        if job is None:
            return False

        self.remove_job_assets(job, storage, coordinator=coordinator)
        return self._repository.delete_job(job_id)

    def bulk_delete_job_results(
        self,
        job_ids: Sequence[str],
        *,
        storage: "StorageService",
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> int:
        """Bulk delete results by removing assets then deleting rows."""
        jobs = self._repository.list_jobs_by_ids(job_ids)
        if not jobs:
            return 0

        for job in jobs:
            self.remove_job_assets(job, storage, coordinator=coordinator)

        deleted = self._repository.delete_jobs([job.id for job in jobs])
        return deleted

    def build_results_archive(
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
        manifest: Dict[str, Any] = {
            "generated_at": generated_at.isoformat(),
            "count": len(jobs),
            "results": [],
        }

        spool = tempfile.SpooledTemporaryFile(max_size=spooled_file_max_size)
        with zipfile.ZipFile(spool, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for job in jobs:
                serialized = coordinator.serialize_delivery_job(job)
                params_payload = serialized.get("params")
                if not isinstance(params_payload, dict):
                    params_payload = {}
                result_payload = serialized.get("result")
                if not isinstance(result_payload, dict):
                    result_payload = {}

                assets = self._extract_assets_from_payload(
                    job,
                    result_payload,
                    storage,
                    params=params_payload,
                )

                asset_entries = []
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

                archive.writestr(
                    f"{base_path}/metadata.json",
                    json.dumps(metadata_payload, indent=2, default=_json_default),
                )

                for index, asset in enumerate(assets):
                    archive_name = f"{base_path}/{index:03d}_{asset.filename}"
                    asset_entry = {
                        "filename": asset.filename,
                        "archive_path": archive_name,
                        "content_type": asset.content_type,
                        "size": asset.size,
                    }

                    try:
                        with archive.open(archive_name, "w") as target:
                            if asset.path:
                                path = Path(asset.path)
                                with path.open("rb") as source:
                                    shutil.copyfileobj(source, target, chunk_size)
                            elif asset.data is not None:
                                target.write(asset.data)
                            else:
                                continue
                    except OSError:
                        continue

                    asset_entries.append(asset_entry)

                manifest["results"].append(
                    {
                        "id": job.id,
                        "prompt": job.prompt,
                        "status": job.status,
                        "created_at": job.created_at.isoformat()
                        if job.created_at
                        else None,
                        "finished_at": job.finished_at.isoformat()
                        if job.finished_at
                        else None,
                        "assets": asset_entries,
                    }
                )

        size = spool.tell()
        spool.seek(0)
        filename = f"generation-results-{generated_at.strftime('%Y%m%d-%H%M%S')}.zip"

        def _iterator() -> Iterator[bytes]:
            try:
                while True:
                    chunk = spool.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                spool.close()

        return ResultArchive(iterator=_iterator(), manifest=manifest, size=size, filename=filename)

    def build_result_download(
        self,
        job: DeliveryJob,
        *,
        storage: "StorageService",
        coordinator: "GenerationCoordinator",
        chunk_size: int = 64 * 1024,
    ) -> Optional[ResultDownload]:
        """Prepare a download payload for the primary asset of ``job``."""
        assets = self._collect_result_assets(job, storage, coordinator=coordinator)
        if not assets:
            return None

        primary = assets[0]
        if primary.path:
            path = Path(primary.path)
            if not storage.validate_file_path(primary.path):
                return None

            def _stream() -> Iterator[bytes]:
                with path.open("rb") as stream:
                    while True:
                        chunk = stream.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk

            size: Optional[int] = primary.size
            if size is None:
                try:
                    size = path.stat().st_size
                except OSError:
                    size = None

            return ResultDownload(
                filename=primary.filename,
                content_type=primary.content_type,
                iterator=_stream(),
                size=size,
            )

        if primary.data is not None:
            data = primary.data

            def _bytes() -> Iterator[bytes]:
                yield data

            return ResultDownload(
                filename=primary.filename,
                content_type=primary.content_type,
                iterator=_bytes(),
                size=len(data),
            )

        return None

    def remove_job_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[str]:
        """Remove persisted files referenced by a job's result payload."""
        removed: List[str] = []
        for asset in self._collect_result_assets(job, storage, coordinator=coordinator):
            if not asset.path:
                continue
            try:
                path = Path(asset.path)
                path.unlink(missing_ok=True)
                removed.append(asset.path)
            except OSError:  # pragma: no cover - best effort cleanup
                continue
        return removed

    def _collect_result_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[ResultAsset]:
        """Collect assets referenced by job results using available context."""
        result_payload: Dict[str, Any] = {}
        params_payload: Dict[str, Any] = {}

        if coordinator is not None:
            serialized = coordinator.serialize_delivery_job(job)
            maybe_params = serialized.get("params")
            if isinstance(maybe_params, dict):
                params_payload = dict(maybe_params)
            maybe_result = serialized.get("result")
            if isinstance(maybe_result, dict):
                result_payload = dict(maybe_result)
        else:
            maybe_params = self.get_job_params(job)
            if isinstance(maybe_params, dict):
                params_payload = dict(maybe_params)
            maybe_result = self.get_job_result(job)
            if isinstance(maybe_result, dict):
                result_payload = dict(maybe_result)

        return self._extract_assets_from_payload(
            job,
            result_payload,
            storage,
            params=params_payload,
        )

    def _extract_assets_from_payload(
        self,
        job: DeliveryJob,
        result_payload: Dict[str, Any],
        storage: "StorageService",
        *,
        params: Optional[Dict[str, Any]] = None,
    ) -> List[ResultAsset]:
        assets: List[ResultAsset] = []
        seen_paths: set[str] = set()

        return_format: Optional[str] = None
        if isinstance(params, dict):
            maybe_format = params.get("return_format")
            if isinstance(maybe_format, str):
                return_format = maybe_format.lower()

        images = result_payload.get("images")
        if isinstance(images, list):
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
                assets.append(asset)

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
            header, _, payload = candidate.partition(",")
            mime = fallback_mime
            prefix = header[5:] if header.startswith("data:") else ""
            if ";" in prefix:
                mime = prefix.split(";", 1)[0] or fallback_mime
            elif prefix:
                mime = prefix
            try:
                binary = base64.b64decode(payload, validate=False)
            except Exception:  # pragma: no cover - invalid payload
                return None
            return ResultAsset(
                filename=default_filename,
                content_type=mime or fallback_mime,
                data=binary,
                size=len(binary),
            )

        normalized_format = (return_format or "").lower()
        path_candidate: Optional[str] = None

        if candidate.startswith("file://"):
            path_candidate = candidate[len("file://") :]
        elif normalized_format in {"file_path", "url"}:
            path_candidate = candidate

        if path_candidate is not None:
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

        try:
            binary = base64.b64decode(candidate, validate=False)
        except Exception:  # pragma: no cover - invalid base64
            return None

        return ResultAsset(
            filename=default_filename,
            content_type=fallback_mime,
            data=binary,
            size=len(binary),
        )

    def _require_orchestrator(self) -> "QueueOrchestrator":
        if self._queue_orchestrator is None:
            raise RuntimeError("Queue orchestrator is not configured for delivery jobs")
        return self._queue_orchestrator
