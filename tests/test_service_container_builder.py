from __future__ import annotations

import contextvars
from contextlib import contextmanager
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

import backend.services as services_module
from backend.services import (
    get_service_container_builder,
    service_container_builder_scope,
)
from backend.services.queue import BackgroundTaskQueueBackend, QueueOrchestrator
from backend.services.service_container_builder import ServiceContainerBuilder


def test_service_container_builder_gpu_cache_invalidation() -> None:
    calls: list[int] = []

    def detector() -> bool:
        calls.append(len(calls))
        return len(calls) == 1

    builder = ServiceContainerBuilder(
        queue_orchestrator_factory=lambda: QueueOrchestrator(
            fallback_backend=BackgroundTaskQueueBackend(lambda _: None),
        ),
        recommendation_gpu_detector=detector,
    )

    assert builder.get_recommendation_gpu_available() is True
    assert builder.get_recommendation_gpu_available() is True
    builder.invalidate_recommendation_gpu_cache()
    assert builder.get_recommendation_gpu_available() is False
    assert len(calls) == 2


def test_service_container_builder_resets_cached_orchestrator() -> None:
    class RecordingQueueOrchestrator(QueueOrchestrator):
        def __init__(self) -> None:
            super().__init__(
                fallback_backend=BackgroundTaskQueueBackend(lambda _: None)
            )
            self.reset_calls = 0

        def reset(self) -> None:
            self.reset_calls += 1
            super().reset()

    builder = ServiceContainerBuilder(
        queue_orchestrator_factory=RecordingQueueOrchestrator
    )

    first = builder._get_queue_orchestrator()
    assert isinstance(first, RecordingQueueOrchestrator)

    builder.reset_cached_queue_orchestrator()
    assert first.reset_calls == 1

    second = builder._get_queue_orchestrator()
    assert second is not first
    assert isinstance(second, RecordingQueueOrchestrator)


def test_service_container_builder_rejects_missing_session() -> None:
    builder = ServiceContainerBuilder()

    with pytest.raises(ValueError, match="requires an active database session"):
        builder.build(None)  # type: ignore[arg-type]


def test_service_container_builder_scope_restores_previous_builder() -> None:
    original = get_service_container_builder()

    with service_container_builder_scope() as scoped:
        assert scoped is get_service_container_builder()
        assert scoped is not original

    assert get_service_container_builder() is original


@contextmanager
def _without_builder_override(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    """Exercise the process-wide default builder instead of a scoped override.

    The autouse ``isolated_service_container_builder`` fixture installs a
    scoped override, which would hide the default-builder path. Clearing the
    override for the duration of the block, and starting from an unset default
    (restored by ``monkeypatch`` afterwards), makes the test hit the lazy
    process-wide creation that used to be lost in copied contexts.
    """
    monkeypatch.setattr(services_module, "_default_builder", None)
    token = services_module._builder_var.set(None)
    try:
        yield
    finally:
        services_module._builder_var.reset(token)


def test_default_builder_is_shared_across_copied_contexts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # FastAPI runs every request and sync dependency in a copied context. The
    # builder created lazily in the first copy must be the one the second sees.
    with _without_builder_override(monkeypatch):
        first = contextvars.copy_context().run(get_service_container_builder)
        second = contextvars.copy_context().run(get_service_container_builder)

        assert first is second
        assert get_service_container_builder() is first
        assert services_module._default_builder is first


def test_scope_override_takes_precedence_over_default_builder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with _without_builder_override(monkeypatch):
        default = get_service_container_builder()
        override = ServiceContainerBuilder()

        with service_container_builder_scope(override) as scoped:
            assert scoped is override
            assert get_service_container_builder() is override

        assert get_service_container_builder() is default


def test_requests_reuse_one_builder_and_its_cached_dependencies(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    builders: list[ServiceContainerBuilder] = []
    queue_factory_calls: list[QueueOrchestrator] = []
    gpu_detector_calls: list[bool] = []

    def queue_orchestrator_factory() -> QueueOrchestrator:
        orchestrator = QueueOrchestrator(
            fallback_backend=BackgroundTaskQueueBackend(lambda _: None),
        )
        queue_factory_calls.append(orchestrator)
        return orchestrator

    def recommendation_gpu_detector() -> bool:
        gpu_detector_calls.append(False)
        return False

    def create_counting_builder() -> ServiceContainerBuilder:
        builder = ServiceContainerBuilder(
            queue_orchestrator_factory=queue_orchestrator_factory,
            recommendation_gpu_detector=recommendation_gpu_detector,
        )
        builders.append(builder)
        return builder

    monkeypatch.setattr(
        services_module, "_create_default_builder", create_counting_builder
    )

    with _without_builder_override(monkeypatch):
        for _ in range(3):
            response = client.get("/api/v1/adapters")
            assert response.status_code == 200

    assert len(builders) == 1
    assert len(queue_factory_calls) == 1
    assert len(gpu_detector_calls) == 1
