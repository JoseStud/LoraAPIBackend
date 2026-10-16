"""Helpers that locate persisted delivery assets and payload metadata."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from backend.models import DeliveryJob
from backend.schemas.delivery_jobs import DeliveryJobResult
from backend.utils.images import parse_output_reference, resolve_output_dir

from ..delivery_repository import DeliveryJobRepository
from ..storage import is_path_within
from .models import ResultAsset

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from ..generation import GenerationCoordinator
    from ..storage import StorageService


class ResultAssetResolver:
    """Discover and delete persisted result assets."""

    def __init__(self, repository: DeliveryJobRepository) -> None:
        """Initialise resolver with the delivery repository."""
        self._repository = repository

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
    def collect(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[ResultAsset]:
        """Collect assets referenced by ``job``'s persisted payloads."""
        _, _, assets = self.collect_with_payloads(
            job,
            storage,
            coordinator=coordinator,
        )
        return assets

    def collect_with_payloads(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> tuple[Dict[str, Any], DeliveryJobResult, List[ResultAsset]]:
        """Return the job's params and stored result alongside resolved assets.

        With a coordinator the params are its generation parameters, otherwise
        the stored delivery params.
        """
        params_payload, result = self._load_payloads(job, coordinator)
        assets = self._extract_assets(job, result, storage)
        return params_payload, result, assets

    def resolve_image(
        self,
        job: DeliveryJob,
        index: int,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> Optional[ResultAsset]:
        """Resolve entry ``index`` of the job's stored ``images`` list."""
        _, result = self._load_payloads(job, coordinator)
        images = result.images or []
        if not 0 <= index < len(images):
            return None
        return self._resolve_asset_value(
            images[index],
            storage,
            default_filename=f"{job.id}-{index:03d}.png",
            return_format=self._resolve_return_format(job),
        )

    def remove(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[str]:
        """Remove any files referenced by ``job`` and return their paths."""
        removed: List[str] = []
        for asset in self.collect(job, storage, coordinator=coordinator):
            if not asset.path:
                continue
            try:
                path = Path(asset.path)
                path.unlink(missing_ok=True)
                removed.append(asset.path)
            except OSError:  # pragma: no cover - best effort cleanup
                continue
        return removed

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_payloads(
        self,
        job: DeliveryJob,
        coordinator: Optional["GenerationCoordinator"],
    ) -> tuple[Dict[str, Any], DeliveryJobResult]:
        if coordinator is not None:
            serialized = coordinator.serialize_delivery_job(job)
            return serialized.params, serialized.result

        params = self._repository.get_job_params(job).to_payload()
        result = self._repository.get_job_result(job) or DeliveryJobResult()
        return params, result

    def _extract_assets(
        self,
        job: DeliveryJob,
        result: DeliveryJobResult,
        storage: "StorageService",
    ) -> List[ResultAsset]:
        assets: List[ResultAsset] = []
        seen_paths: set[str] = set()
        return_format = self._resolve_return_format(job)

        if result.images:
            assets.extend(
                self._collect_image_assets(
                    job,
                    result.images,
                    storage,
                    return_format,
                    seen_paths,
                ),
            )

        for key, value in (
            ("image_url", result.image_url),
            ("thumbnail_url", result.thumbnail_url),
        ):
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
        images: List[str],
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

        relative_path = parse_output_reference(candidate)
        if relative_path is not None:
            return self._build_reference_asset(
                relative_path, default_filename, fallback_mime, storage
            )

        normalized_format = (return_format or "").lower()
        path_candidate: Optional[str] = None

        if candidate.startswith("file://"):
            path_candidate = candidate[len("file://") :]
        elif normalized_format in {"file_path", "url"}:
            path_candidate = candidate

        if path_candidate is not None:
            return self._build_file_asset(
                path_candidate, default_filename, fallback_mime, storage
            )

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

    def _build_reference_asset(
        self,
        relative_path: str,
        default_filename: str,
        fallback_mime: str,
        storage: "StorageService",
    ) -> Optional[ResultAsset]:
        """Resolve an output reference to a file inside the output directory.

        A reference that escapes the directory (``..``, an absolute path, a
        symlink pointing elsewhere) resolves to nothing.
        """
        output_dir = resolve_output_dir()
        path = output_dir / relative_path
        if not is_path_within(path, output_dir):
            return None
        return self._build_file_asset(
            str(path), default_filename, fallback_mime, storage
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

    def _resolve_return_format(self, job: DeliveryJob) -> Optional[str]:
        """Return the ``return_format`` stored with the job's params, lowercased."""
        return_format = self._repository.get_job_params(job).return_format
        return return_format.lower() if return_format is not None else None


__all__ = ["ResultAssetResolver"]
