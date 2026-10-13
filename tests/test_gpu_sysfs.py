"""GPU detection falls back to Linux sysfs when PyTorch can't see the card."""

import builtins

import pytest

from backend.core import gpu


@pytest.fixture
def fake_sysfs(tmp_path, monkeypatch):
    drm = tmp_path / "drm"
    device = drm / "card1" / "device"
    hwmon = device / "hwmon" / "hwmon3"
    hwmon.mkdir(parents=True)
    (drm / "card1-DP-1").mkdir()
    files = {
        device / "vendor": "0x1002",
        device / "device": "0x73ff",
        device / "mem_info_vram_total": str(8 * 1024**3),
        device / "mem_info_vram_used": str(3 * 1024**3),
        device / "gpu_busy_percent": "32",
        hwmon / "temp1_input": "44000",
        hwmon / "power1_average": "29000000",
        hwmon / "pwm1": "128",
        hwmon / "pwm1_max": "255",
    }
    for path, value in files.items():
        path.write_text(value + "\n")

    pci_ids = tmp_path / "pci.ids"
    pci_ids.write_text(
        "# comment\n"
        "1002  Advanced Micro Devices, Inc. [AMD/ATI]\n"
        "\t73bf  Navi 21 [Radeon RX 6800/6800 XT / 6900 XT]\n"
        "\t73ff  Navi 23 [Radeon RX 6600/6600 XT/6600M]\n"
        "\t\t1002 2413  some subsystem\n"
        "10de  NVIDIA Corporation\n"
        "\t73ff  Not this one\n"
    )
    monkeypatch.setattr(gpu, "DRM_ROOT", drm)
    monkeypatch.setattr(gpu, "PCI_IDS_PATHS", (pci_ids,))
    return drm


@pytest.fixture
def no_torch(monkeypatch):
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "torch":
            raise ImportError("no torch")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)


def test_detects_amd_card_from_sysfs(fake_sysfs, no_torch):
    info = gpu.detect_gpu()

    assert info["available"] is True
    assert info["type"] == "amd"
    assert info["device"] == "cpu"  # PyTorch still can't use it
    details = info["details"]
    assert details["device_name"] == "AMD Radeon RX 6600/6600 XT/6600M"
    assert details["memory_total"] == 8 * 1024**3
    assert details["utilization"] == 32
    assert details["temperature"] == 44
    assert details["power_draw_watts"] == 29
    assert details["fan_speed"] == 50


def test_memory_info_reports_card_wide_vram(fake_sysfs, no_torch):
    memory = gpu.get_gpu_memory_info()

    assert memory == {
        "total": 8 * 1024**3,
        "allocated": 3 * 1024**3,
        "reserved": 3 * 1024**3,
        "free": 5 * 1024**3,
    }


def test_reports_cpu_mode_without_a_gpu(tmp_path, monkeypatch, no_torch):
    monkeypatch.setattr(gpu, "DRM_ROOT", tmp_path / "missing")

    assert gpu.detect_gpu()["available"] is False
    assert gpu.get_gpu_memory_info() is None
