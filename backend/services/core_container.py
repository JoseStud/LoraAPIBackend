"""Core service registry wiring for backend dependencies."""

from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from .analytics_repository import AnalyticsRepository
from .delivery_repository import DeliveryJobRepository
from .providers.storage import StorageServiceFactory, make_storage_service
from .storage import StorageService


class CoreServiceRegistry:
    """Provide access to infrastructure primitives shared across services."""

    def __init__(
        self,
        db_session: Optional[Session],
        *,
        storage_provider: StorageServiceFactory = make_storage_service,
        delivery_repository: Optional[DeliveryJobRepository] = None,
        analytics_repository: Optional[AnalyticsRepository] = None,
    ) -> None:
        """Store shared service factories and repositories."""
        self.db_session = db_session
        self._storage_provider = storage_provider
        self._storage_service: Optional[StorageService] = None
        self._delivery_repository = delivery_repository
        self._analytics_repository = analytics_repository

    @property
    def storage(self) -> StorageService:
        """Return the lazily constructed storage service."""
        if self._storage_service is None:
            self._storage_service = self._storage_provider()
        return self._storage_service

    @property
    def delivery_repository(self) -> DeliveryJobRepository:
        """Return the delivery repository configured for this registry."""
        if self._delivery_repository is None:
            raise ValueError("DeliveryService requires a delivery repository")
        return self._delivery_repository

    @property
    def analytics_repository(self) -> AnalyticsRepository:
        """Return the analytics repository configured for this registry."""
        if self._analytics_repository is None:
            raise ValueError("AnalyticsService requires an analytics repository")
        return self._analytics_repository


__all__ = ["CoreServiceRegistry"]
