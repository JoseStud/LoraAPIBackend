from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from .adapters import AdapterService
from .analytics import AnalyticsService
from .analytics_repository import AnalyticsRepository
from .composition import ComposeService
from .core_container import CoreServiceRegistry
from .generation import GenerationService
from .providers.analytics import AnalyticsServiceFactory, make_analytics_service
from .providers.generation import (
    ComposeServiceFactory,
    GenerationServiceFactory,
    make_compose_service,
    make_generation_service,
)
from .providers.recommendations import (
    RecommendationServiceFactory,
    make_recommendation_service,
)
from .providers.storage import AdapterServiceFactory, make_adapter_service
from .recommendations import RecommendationService


class DomainServiceRegistry:
    """Aggregate domain specific service factories."""

    def __init__(
        self,
        core: CoreServiceRegistry,
        *,
        db_session: Optional[Session],
        analytics_repository: Optional[AnalyticsRepository],
        adapter_provider: AdapterServiceFactory = make_adapter_service,
        compose_provider: ComposeServiceFactory = make_compose_service,
        generation_provider: GenerationServiceFactory = make_generation_service,
        analytics_provider: AnalyticsServiceFactory = make_analytics_service,
        recommendation_provider: RecommendationServiceFactory = make_recommendation_service,
        recommendation_gpu_available: Optional[bool] = None,
    ) -> None:
        self._core = core
        self.db_session = db_session
        self._analytics_repository = analytics_repository
        self._adapter_provider = adapter_provider
        self._compose_provider = compose_provider
        self._generation_provider = generation_provider
        self._analytics_provider = analytics_provider
        self._recommendation_provider = recommendation_provider
        self._recommendation_gpu_available = recommendation_gpu_available

        self._adapter_service: Optional[AdapterService] = None
        self._compose_service: Optional[ComposeService] = None
        self._generation_service: Optional[GenerationService] = None
        self._analytics_service: Optional[AnalyticsService] = None
        self._recommendation_service: Optional[RecommendationService] = None

    @property
    def adapters(self) -> AdapterService:
        """Return the adapter service bound to the configured session."""

        if self.db_session is None:
            raise ValueError("AdapterService requires an active database session")
        if self._adapter_service is None:
            self._adapter_service = self._adapter_provider(
                db_session=self.db_session,
                storage_service=self._core.storage,
            )
        return self._adapter_service

    @property
    def compose(self) -> ComposeService:
        """Return the compose service."""

        if self._compose_service is None:
            self._compose_service = self._compose_provider()
        return self._compose_service

    @property
    def generation(self) -> GenerationService:
        """Return the generation service."""

        if self._generation_service is None:
            self._generation_service = self._generation_provider()
        return self._generation_service

    @property
    def analytics(self) -> AnalyticsService:
        """Return the analytics service bound to the configured session."""

        if self.db_session is None:
            raise ValueError("AnalyticsService requires an active database session")
        if self._analytics_repository is None:
            raise ValueError("AnalyticsService requires an analytics repository")
        if self._analytics_service is None:
            self._analytics_service = self._analytics_provider(
                self.db_session,
                repository=self._analytics_repository,
            )
        return self._analytics_service

    @property
    def recommendations(self) -> RecommendationService:
        """Return the recommendation service bound to the configured session."""

        if self.db_session is None:
            raise ValueError("RecommendationService requires an active database session")
        if self._recommendation_gpu_available is None:
            raise ValueError(
                "RecommendationService requires an explicit recommendation_gpu_available flag",
            )
        if self._recommendation_service is None:
            self._recommendation_service = self._recommendation_provider(
                self.db_session,
                gpu_available=self._recommendation_gpu_available,
            )
        return self._recommendation_service


__all__ = ["DomainServiceRegistry"]
