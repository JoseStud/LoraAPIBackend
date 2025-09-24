"""Helpers that locate persisted delivery assets and payload metadata."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from backend.models import DeliveryJob

from ..delivery_repository import DeliveryJobRepository
from .models import ResultAsset

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from ..generation import GenerationCoordinator
    from ..storage import StorageService


class ResultAssetResolver:
    """Discover and delete persisted result assets."""

    def __init__(self, repository: DeliveryJobRepository) -> None:
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
    ) -> tuple[Dict[str, Any], Dict[str, Any], List[ResultAsset]]:
        """Return payload metadata alongside resolved assets."""
        params_payload, result_payload = self._load_payloads(job, coordinator)
        assets = self._extract_assets(
            job,
            result_payload,
            storage,
            params=params_payload,
        )
        return params_payload, result_payload, assets

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
                ),
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


__all__ = ["ResultAssetResolver"]
