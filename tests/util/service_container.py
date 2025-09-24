"""Test helpers for working with the service container builder."""

from __future__ import annotations

from backend.services.service_container_builder import ServiceContainerBuilder


def reset_service_container_builder(builder: ServiceContainerBuilder) -> None:
    """Clear cached state on ``builder`` to mimic a fresh application startup."""
    builder.reset_cached_queue_orchestrator()
    builder.invalidate_recommendation_gpu_cache()
