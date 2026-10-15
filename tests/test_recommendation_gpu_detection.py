"""GPU detection for the recommendation stack, with ``torch`` stubbed out."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from backend.services.recommendations.model_bootstrap import (
    RecommendationModelBootstrap,
)


def _install_fake_torch(
    monkeypatch: pytest.MonkeyPatch,
    *,
    cuda_available: bool,
    hip_version: str | None,
    mps_available: bool = False,
) -> None:
    fake_torch = SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: cuda_available),
        version=SimpleNamespace(hip=hip_version, cuda=None),
        backends=SimpleNamespace(
            mps=SimpleNamespace(is_available=lambda: mps_available)
        ),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)


def test_rocm_build_without_device_is_not_gpu_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch(monkeypatch, cuda_available=False, hip_version="6.2.41133")

    assert RecommendationModelBootstrap.is_gpu_available() is False


def test_rocm_build_with_device_is_gpu_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch(monkeypatch, cuda_available=True, hip_version="6.2.41133")

    assert RecommendationModelBootstrap.is_gpu_available() is True


def test_cuda_device_is_gpu_available(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_torch(monkeypatch, cuda_available=True, hip_version=None)

    assert RecommendationModelBootstrap.is_gpu_available() is True


def test_cpu_only_build_is_not_gpu_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch(monkeypatch, cuda_available=False, hip_version=None)

    assert RecommendationModelBootstrap.is_gpu_available() is False
