"""Shared fixtures for recommendation service tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.models import Adapter
from backend.services.recommendations import (
    RecommendationModelBootstrap,
    RecommendationRepository,
)


@pytest.fixture(autouse=True)
def force_cpu_mode():
    """Ensure recommendation tests run with GPU detection disabled."""
    with patch.object(
        RecommendationModelBootstrap,
        "is_gpu_available",
        return_value=False,
    ):
        yield


@pytest.fixture
def sample_adapter() -> Adapter:
    """Create a sample adapter for testing."""
    return Adapter(
        id="adapter-1",
        name="Adapter",
        description="Test adapter",
        file_path="/tmp/adapter.safetensors",
        active=True,
    )


@pytest.fixture
def repository(db_session):
    """Return a repository tied to the ephemeral database session."""
    return RecommendationRepository(db_session)


@pytest.fixture
def model_registry(monkeypatch):
    """Provide an isolated recommendation model registry for tests."""
    from backend.services.recommendations.model_registry import (
        RecommendationModelRegistry,
    )

    monkeypatch.setattr(
        RecommendationModelRegistry,
        "_shared_semantic_embedder",
        None,
    )
    monkeypatch.setattr(
        RecommendationModelRegistry,
        "_shared_feature_extractor",
        None,
    )
    monkeypatch.setattr(
        RecommendationModelRegistry,
        "_shared_recommendation_engine",
        None,
    )

    return RecommendationModelRegistry
