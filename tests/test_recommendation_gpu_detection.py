"""GPU detection for the recommendation stack, with ``torch`` stubbed out."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from backend.core import gpu
from backend.services.recommendations import (
    EmbeddingService,
    RecommendationModelRegistry,
)
from backend.services.recommendations.encoders import SentenceTransformerProvider


def _install_fake_torch(
    monkeypatch: pytest.MonkeyPatch,
    *,
    cuda_available: bool,
    hip_version: str | None,
    mps_available: bool = False,
) -> None:
    fake_torch = SimpleNamespace(
        __version__="2.5.0",
        cuda=SimpleNamespace(
            is_available=lambda: cuda_available,
            get_device_name=lambda *_: "Radeon RX 6600" if hip_version else "RTX",
            device_count=lambda: 1,
            get_device_properties=lambda _: SimpleNamespace(total_memory=8 << 30),
            memory_allocated=lambda *_: 2 << 30,
        ),
        version=SimpleNamespace(hip=hip_version, cuda=None),
        backends=SimpleNamespace(
            mps=SimpleNamespace(is_available=lambda: mps_available)
        ),
        mps=SimpleNamespace(current_allocated_memory=lambda: 1 << 30),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)


def test_rocm_build_without_device_is_not_gpu_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch(monkeypatch, cuda_available=False, hip_version="6.2.41133")

    assert EmbeddingService.is_gpu_available() is False


def test_rocm_build_with_device_is_gpu_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch(monkeypatch, cuda_available=True, hip_version="6.2.41133")

    assert EmbeddingService.is_gpu_available() is True


def test_cuda_device_is_gpu_available(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_torch(monkeypatch, cuda_available=True, hip_version=None)

    assert EmbeddingService.is_gpu_available() is True


def test_cpu_only_build_is_not_gpu_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch(monkeypatch, cuda_available=False, hip_version=None)

    assert EmbeddingService.is_gpu_available() is False


@pytest.mark.parametrize(
    ("cuda_available", "hip_version", "mps_available", "expected"),
    [
        (False, None, True, "mps"),
        (True, None, False, "cuda"),
        (True, "6.2.41133", False, "cuda"),
        (False, "6.2.41133", False, None),
        (False, None, False, None),
    ],
    ids=["mps", "cuda", "rocm", "rocm-without-device", "cpu"],
)
def test_registry_device_follows_the_detected_gpu(
    monkeypatch: pytest.MonkeyPatch,
    cuda_available: bool,
    hip_version: str | None,
    mps_available: bool,
    expected: str | None,
) -> None:
    """Apple MPS used to count as a GPU and then be handed ``"cuda"``."""
    _install_fake_torch(
        monkeypatch,
        cuda_available=cuda_available,
        hip_version=hip_version,
        mps_available=mps_available,
    )

    gpu_enabled = EmbeddingService.is_gpu_available()
    registry = RecommendationModelRegistry(gpu_enabled=gpu_enabled)

    assert gpu_enabled is (expected is not None)
    assert registry.device == (expected or "cpu")
    assert gpu.torch_gpu_device() == expected


def test_mps_detection_reports_the_mps_device(monkeypatch: pytest.MonkeyPatch):
    _install_fake_torch(
        monkeypatch, cuda_available=False, hip_version=None, mps_available=True
    )

    info = gpu.detect_gpu()

    assert (info["available"], info["type"], info["device"]) == (
        True,
        "apple",
        "mps",
    )
    assert gpu.get_optimal_device() == "mps"
    assert EmbeddingService.gpu_memory_usage_gb() == 1.0


def test_rocm_detection_keeps_the_cuda_device(monkeypatch: pytest.MonkeyPatch):
    _install_fake_torch(monkeypatch, cuda_available=True, hip_version="6.2.41133")

    info = gpu.detect_gpu()

    assert (info["type"], info["device"]) == ("amd", "cuda")
    assert EmbeddingService.gpu_memory_usage_gb() == 2.0


def test_explicit_gpu_flag_without_torch_keeps_cuda(monkeypatch):
    """Callers that force the GPU flag still get a GPU device string."""
    monkeypatch.setitem(sys.modules, "torch", None)  # import torch -> ImportError

    assert gpu.torch_gpu_device() is None
    assert RecommendationModelRegistry(gpu_enabled=True).device == "cuda"
    assert RecommendationModelRegistry(gpu_enabled=False).device == "cpu"


def _provider_device_for(
    monkeypatch: pytest.MonkeyPatch,
    *,
    cuda_available: bool,
    hip_version: str | None,
    mps_available: bool = False,
) -> str:
    fake_torch = SimpleNamespace(
        cuda=SimpleNamespace(
            is_available=lambda: cuda_available,
            get_device_name=lambda *_: "Fake GPU",
        ),
        version=SimpleNamespace(hip=hip_version, cuda=None),
        backends=SimpleNamespace(
            mps=SimpleNamespace(is_available=lambda: mps_available)
        ),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)

    provider = SentenceTransformerProvider(device="cuda", force_fallback=True)
    provider._configure_torch_device()
    return provider.device


def test_provider_rocm_build_without_device_falls_back_to_cpu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    device = _provider_device_for(
        monkeypatch, cuda_available=False, hip_version="6.2.41133"
    )

    assert device == "cpu"


def test_provider_rocm_build_with_device_uses_cuda(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    device = _provider_device_for(
        monkeypatch, cuda_available=True, hip_version="6.2.41133"
    )

    assert device == "cuda"


def test_provider_falls_back_to_mps_when_only_mps_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    device = _provider_device_for(
        monkeypatch, cuda_available=False, hip_version=None, mps_available=True
    )

    assert device == "mps"
