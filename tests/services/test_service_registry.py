"""Behaviour of the single :class:`ServiceRegistry` service container."""

from __future__ import annotations

from dataclasses import fields, replace
from unittest.mock import MagicMock

import pytest

from backend.services import ServiceFactories, ServiceRegistry
from backend.services.analytics import AnalyticsService
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.queue import QueueOrchestrator
from backend.services.service_container_builder import ServiceContainerBuilder
from backend.services.service_registry import (
    make_adapter_service,
    make_storage_service,
)
from backend.services.websocket import get_websocket_service, websocket_service


def _counting_factories() -> tuple[ServiceFactories, dict[str, MagicMock]]:
    """Return factories where every field is a mock returning a distinct object."""
    mocks = {
        field.name: MagicMock(name=field.name) for field in fields(ServiceFactories)
    }
    return ServiceFactories(**mocks), mocks


def _full_registry(db_session, factories: ServiceFactories) -> ServiceRegistry:
    return ServiceRegistry(
        db_session,
        queue_orchestrator=MagicMock(spec=QueueOrchestrator),
        delivery_repository=MagicMock(spec=DeliveryJobRepository),
        analytics_repository=MagicMock(spec=AnalyticsRepository),
        recommendation_gpu_available=False,
        factories=factories,
    )


def test_default_factories_are_the_classes_or_make_functions() -> None:
    factories = ServiceFactories()

    assert factories.storage is make_storage_service
    assert factories.adapter is make_adapter_service
    assert factories.compose is ComposeService
    assert factories.generation is GenerationService
    assert factories.generation_coordinator is GenerationCoordinator
    assert factories.websocket is get_websocket_service
    assert factories.analytics is AnalyticsService
    assert factories.delivery is DeliveryService


def test_registry_shares_the_process_wide_websocket_service(db_session) -> None:
    registry = ServiceRegistry(db_session)

    assert registry.websocket is websocket_service


def test_services_are_built_once_and_shared_between_dependents(db_session) -> None:
    factories, mocks = _counting_factories()
    registry = _full_registry(db_session, factories)

    for name in (
        "storage",
        "adapters",
        "compose",
        "generation",
        "analytics",
        "recommendations",
        "recommendation_jobs",
        "archive",
        "deliveries",
        "websocket",
        "system",
        "generation_coordinator",
    ):
        assert getattr(registry, name) is getattr(registry, name)

    for name, factory in mocks.items():
        assert factory.call_count == 1, name

    mocks["archive"].assert_called_once_with(registry.adapters, registry.storage)
    mocks["system"].assert_called_once_with(registry.deliveries)
    mocks["generation_coordinator"].assert_called_once_with(
        registry.deliveries,
        registry.generation,
    )
    mocks["recommendation_jobs"].assert_called_once_with(
        registry._queue_orchestrator, gpu_available=False
    )


@pytest.mark.parametrize(
    ("attribute", "message"),
    [
        ("adapters", "AdapterService requires an active database session"),
        ("analytics", "AnalyticsService requires an active database session"),
        (
            "recommendations",
            "RecommendationService requires an active database session",
        ),
        ("deliveries", "DeliveryService requires an active database session"),
    ],
)
def test_session_bound_services_require_a_session(attribute, message) -> None:
    factories, _ = _counting_factories()
    registry = _full_registry(None, factories)

    with pytest.raises(ValueError, match=message):
        getattr(registry, attribute)


@pytest.mark.parametrize(
    ("missing", "attribute", "message"),
    [
        (
            "analytics_repository",
            "analytics",
            "AnalyticsService requires an analytics repository",
        ),
        (
            "recommendation_gpu_available",
            "recommendations",
            "RecommendationService requires an explicit "
            "recommendation_gpu_available flag",
        ),
        (
            "queue_orchestrator",
            "deliveries",
            "DeliveryService requires a queue orchestrator",
        ),
        (
            "delivery_repository",
            "deliveries",
            "DeliveryService requires a delivery repository",
        ),
    ],
)
def test_missing_collaborators_fail_only_the_services_that_need_them(
    db_session, missing, attribute, message
) -> None:
    factories, _ = _counting_factories()
    kwargs = {
        "queue_orchestrator": MagicMock(spec=QueueOrchestrator),
        "delivery_repository": MagicMock(spec=DeliveryJobRepository),
        "analytics_repository": MagicMock(spec=AnalyticsRepository),
        "recommendation_gpu_available": False,
        missing: None,
    }
    registry = ServiceRegistry(db_session, factories=factories, **kwargs)

    with pytest.raises(ValueError, match=message):
        getattr(registry, attribute)

    # Services that do not need the missing collaborator still resolve.
    assert registry.compose is not None
    assert registry.adapters is not None


def test_with_overrides_accepts_factories_instance_without_mutating_base(
    db_session,
) -> None:
    base = ServiceContainerBuilder(recommendation_gpu_detector=lambda: False)
    compose_service = object()
    override = base.with_overrides(
        factories=replace(ServiceFactories(), compose=lambda: compose_service),
    )

    queue = MagicMock(spec=QueueOrchestrator)
    overridden = override.build(db_session, queue_orchestrator=queue)
    default = base.build(db_session, queue_orchestrator=queue)

    assert overridden.compose is compose_service
    assert default.compose is not compose_service
