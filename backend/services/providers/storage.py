"""Storage-related provider factories and type-safe interfaces."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from sqlmodel import Session

from ..adapters import AdapterService
from ..storage import StorageBackend, StorageService, get_storage_backend


class StorageServiceFactory(Protocol):
    """Callable protocol for creating :class:`StorageService` instances."""

    def __call__(self, *, backend: Optional[StorageBackend] = None) -> StorageService:
        """Create a :class:`StorageService` instance."""
        ...


class AdapterServiceFactory(Protocol):
    """Callable protocol for creating :class:`AdapterService` instances."""

    def __call__(
        self,
        *,
        db_session: Session,
        storage_service: StorageService,
        storage_backend: Optional[StorageBackend] = None,
    ) -> AdapterService:
        """Create an :class:`AdapterService` instance."""
        ...


def make_storage_service(*, backend: Optional[StorageBackend] = None) -> StorageService:
    """Create a :class:`StorageService` using the provided backend."""
    backend = backend or get_storage_backend()
    return StorageService(backend)


def make_adapter_service(
    *,
    db_session: Session,
    storage_service: StorageService,
    storage_backend: Optional[StorageBackend] = None,
) -> AdapterService:
    """Create an :class:`AdapterService` with explicit collaborators."""
    backend = storage_backend or storage_service.backend
    return AdapterService(db_session, storage_backend=backend)


@dataclass(frozen=True)
class StorageProviders:
    """Grouped storage-related provider callables."""

    storage: StorageServiceFactory = make_storage_service
    adapter: AdapterServiceFactory = make_adapter_service


__all__ = [
    "AdapterServiceFactory",
    "StorageProviders",
    "StorageServiceFactory",
    "make_adapter_service",
    "make_storage_service",
]
