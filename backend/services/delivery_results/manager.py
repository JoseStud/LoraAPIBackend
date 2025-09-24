"""Public facade for interacting with delivery result helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional, Sequence

from backend.models import DeliveryJob

from ..delivery_repository import DeliveryJobRepository
from .archive_builder import ResultArchiveBuilder
from .asset_resolver import ResultAssetResolver
from .download_builder import ResultDownloadBuilder
from .models import ResultArchive, ResultAsset, ResultDownload

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from ..generation import GenerationCoordinator
    from ..storage import StorageService


class DeliveryResultManager:
    """Encapsulate asset discovery, cleanup, and export behaviour."""

    def __init__(
        self,
        repository: DeliveryJobRepository,
        *,
        asset_resolver: Optional[ResultAssetResolver] = None,
        archive_builder: Optional[ResultArchiveBuilder] = None,
        download_builder: Optional[ResultDownloadBuilder] = None,
    ) -> None:
        """Compose helper utilities used to manage delivery results."""
        self._repository = repository
        self._assets = asset_resolver or ResultAssetResolver(repository)
        self._archive_builder = archive_builder or ResultArchiveBuilder(
            repository,
            self._assets,
        )
        self._download_builder = download_builder or ResultDownloadBuilder(self._assets)

    # ------------------------------------------------------------------
    # Asset helpers
    # ------------------------------------------------------------------
    def collect_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[ResultAsset]:
        """Collect assets referenced by ``job``'s persisted payloads."""
        return self._assets.collect(job, storage, coordinator=coordinator)

    def remove_assets(
        self,
        job: DeliveryJob,
        storage: "StorageService",
        *,
        coordinator: Optional["GenerationCoordinator"] = None,
    ) -> List[str]:
        """Remove any files referenced by ``job`` and return their paths."""
        return self._assets.remove(job, storage, coordinator=coordinator)

    # ------------------------------------------------------------------
    # Archive and download helpers
    # ------------------------------------------------------------------
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
        return self._archive_builder.build(
            job_ids,
            storage=storage,
            coordinator=coordinator,
            include_metadata=include_metadata,
            chunk_size=chunk_size,
            spooled_file_max_size=spooled_file_max_size,
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
        return self._download_builder.build(
            job,
            storage=storage,
            coordinator=coordinator,
            chunk_size=chunk_size,
        )


__all__ = [
    "DeliveryResultManager",
    "ResultArchive",
    "ResultAsset",
    "ResultDownload",
]
