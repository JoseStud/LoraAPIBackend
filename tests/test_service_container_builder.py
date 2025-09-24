from __future__ import annotations

import pytest

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
