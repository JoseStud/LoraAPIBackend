from __future__ import annotations

from backend.services.queue import BackgroundTaskQueueBackend, QueueOrchestrator
from backend.services.service_container_builder import ServiceContainerBuilder


def test_service_container_builder_gpu_cache_invalidation() -> None:
    calls: list[int] = []

    def detector() -> bool:
        calls.append(len(calls))
        return len(calls) == 1

    builder = ServiceContainerBuilder(
        queue_orchestrator_factory=lambda: QueueOrchestrator(
            fallback_backend=BackgroundTaskQueueBackend(lambda _: None)
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
            super().__init__(fallback_backend=BackgroundTaskQueueBackend(lambda _: None))
            self.reset_calls = 0

        def reset(self) -> None:
            self.reset_calls += 1
            super().reset()

    builder = ServiceContainerBuilder(queue_orchestrator_factory=RecordingQueueOrchestrator)

    first = builder._get_queue_orchestrator()
    assert isinstance(first, RecordingQueueOrchestrator)

    builder.reset_cached_queue_orchestrator()
    assert first.reset_calls == 1

    second = builder._get_queue_orchestrator()
    assert second is not first
    assert isinstance(second, RecordingQueueOrchestrator)
