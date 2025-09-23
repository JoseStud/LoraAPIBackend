"""Archive service provider factories and protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from ..adapters import AdapterService
from ..archive import ArchiveExportPlanner, ArchiveImportExecutor, ArchiveService
from ..storage import StorageService


class ArchiveServiceFactory(Protocol):
    """Callable protocol for creating :class:`ArchiveService` instances."""

    def __call__(
        self,
        adapter_service: AdapterService,
        storage_service: StorageService,
        *,
        planner: Optional[ArchiveExportPlanner] = None,
        executor: Optional[ArchiveImportExecutor] = None,
        chunk_size: int = 64 * 1024,
        spooled_file_max_size: int = 32 * 1024 * 1024,
    ) -> ArchiveService:
        ...


def make_archive_service(
    adapter_service: AdapterService,
    storage_service: StorageService,
    *,
    planner: Optional[ArchiveExportPlanner] = None,
    executor: Optional[ArchiveImportExecutor] = None,
    chunk_size: int = 64 * 1024,
    spooled_file_max_size: int = 32 * 1024 * 1024,
) -> ArchiveService:
    """Create an :class:`ArchiveService` wired with planner and executor collaborators."""

    return ArchiveService(
        adapter_service,
        storage_service,
        planner=planner,
        executor=executor,
        chunk_size=chunk_size,
        spooled_file_max_size=spooled_file_max_size,
    )


@dataclass(frozen=True)
class ArchiveProviders:
    """Grouped archive-related provider callables."""

    archive: ArchiveServiceFactory = make_archive_service


__all__ = [
    "ArchiveProviders",
    "ArchiveServiceFactory",
    "make_archive_service",
]

