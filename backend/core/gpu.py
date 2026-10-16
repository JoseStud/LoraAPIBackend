"""GPU detection and configuration utilities."""

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

from backend.core.logging import get_logger

logger = get_logger(__name__)

DRM_ROOT = Path("/sys/class/drm")
PCI_IDS_PATHS = (Path("/usr/share/hwdata/pci.ids"), Path("/usr/share/misc/pci.ids"))
_VENDORS = {
    "0x1002": ("amd", "AMD"),
    "0x10de": ("nvidia", "NVIDIA"),
    "0x8086": ("intel", "Intel"),
}


def torch_gpu_device() -> Optional[str]:
    """Return the PyTorch device string of a usable GPU, or ``None``.

    ``"cuda"`` covers NVIDIA and AMD ROCm (HIP) builds, which PyTorch exposes
    through ``torch.cuda``; Apple Silicon is ``"mps"``. A build without a
    usable device (a ROCm build on a machine without the GPU) and a missing
    PyTorch both return ``None``. PyTorch is imported lazily.
    """
    try:
        import torch
    except ImportError:
        return None

    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(getattr(torch, "backends", None), "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return None


def _read_sysfs(path: Path) -> Optional[str]:
    try:
        return path.read_text().strip()
    except (OSError, ValueError):
        return None


def _read_sysfs_int(path: Path) -> Optional[int]:
    value = _read_sysfs(path)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


# Cached: the dashboard polls status every few seconds and pci.ids is ~1.5 MB.
@lru_cache(maxsize=8)
def _pci_device_name(vendor_id: str, device_id: str) -> Optional[str]:
    """Look up a marketing name such as "Radeon RX 6600" in the pci.ids database."""
    vendor = vendor_id.removeprefix("0x").lower()
    device = device_id.removeprefix("0x").lower()
    for ids_path in PCI_IDS_PATHS:
        try:
            lines = ids_path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        in_vendor = False
        for line in lines:
            if not line or line.startswith("#"):
                continue
            if not line.startswith("\t"):
                in_vendor = line.lower().startswith(vendor + " ")
                continue
            if in_vendor and not line.startswith("\t\t"):
                code, _, name = line.strip().partition(" ")
                if code.lower() == device:
                    name = name.strip()
                    # "Navi 23 [Radeon RX 6600/6600 XT/6600M]" -> the bracketed part
                    if "[" in name and name.endswith("]"):
                        name = name[name.index("[") + 1 : -1]
                    return name
    return None


def _detect_sysfs_gpu() -> Optional[Dict[str, Any]]:
    """Read the GPU from Linux DRM sysfs, for hosts where PyTorch can't see it.

    The manager usually runs without a GPU-enabled PyTorch build (generation
    happens in SD.Next), so this reports the card that is actually installed.
    Only drivers that expose VRAM counters (amdgpu) are recognised.
    """
    best: Optional[Dict[str, Any]] = None
    try:
        cards = sorted(DRM_ROOT.glob("card[0-9]*"))
    except OSError:
        return None
    for card in cards:
        if "-" in card.name:  # connectors such as card1-DP-1
            continue
        device_dir = card / "device"
        vram_total = _read_sysfs_int(device_dir / "mem_info_vram_total")
        if not vram_total:
            continue
        vendor_id = (_read_sysfs(device_dir / "vendor") or "").lower()
        device_id = (_read_sysfs(device_dir / "device") or "").lower()
        gpu_type, vendor_label = _VENDORS.get(vendor_id, ("unknown", "GPU"))
        model = _pci_device_name(vendor_id, device_id) if vendor_id else None
        details: Dict[str, Any] = {
            "device_name": f"{vendor_label} {model}"
            if model
            else f"{vendor_label} GPU ({device_id})",
            "memory_total": vram_total,
            "memory_used": _read_sysfs_int(device_dir / "mem_info_vram_used"),
            "utilization": _read_sysfs_int(device_dir / "gpu_busy_percent"),
            "source": "sysfs",
            "torch_usable": False,
        }
        hwmon = next(iter(sorted((device_dir / "hwmon").glob("hwmon*"))), None)
        if hwmon is not None:
            temp = _read_sysfs_int(hwmon / "temp1_input")
            power = _read_sysfs_int(hwmon / "power1_average") or _read_sysfs_int(
                hwmon / "power1_input"
            )
            pwm = _read_sysfs_int(hwmon / "pwm1")
            pwm_max = _read_sysfs_int(hwmon / "pwm1_max") or 255
            details["temperature"] = round(temp / 1000) if temp is not None else None
            details["power_draw_watts"] = (
                round(power / 1_000_000) if power is not None else None
            )
            details["fan_speed"] = (
                round(pwm * 100 / pwm_max) if pwm is not None else None
            )
        if best is None or vram_total > best["details"]["memory_total"]:
            best = {
                "available": True,
                "type": gpu_type,
                # PyTorch can't use it from this process, so keep tensors on the CPU.
                "device": "cpu",
                "details": details,
            }
    return best


def detect_gpu() -> Dict[str, Any]:
    """Detect available GPU and return configuration info.

    Returns:
        Dictionary with GPU information including:
        - available: bool - Whether GPU is available
        - type: str - 'amd', 'nvidia', 'apple', or 'cpu' (sysfs: 'intel' too)
        - device: str - Device string for PyTorch ('cuda', 'mps' or 'cpu')
        - details: dict - Additional GPU information

    """
    gpu_info = {
        "available": False,
        "type": "cpu",
        "device": "cpu",
        "details": {},
    }

    try:
        import torch

        # Check for CUDA/ROCm
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)

            # Detect if this is AMD GPU (common AMD GPU names)
            is_amd = any(
                amd_identifier in device_name.lower()
                for amd_identifier in [
                    "amd",
                    "radeon",
                    "rx ",
                    "vega",
                    "navi",
                    "rdna",
                    "gfx",
                ]
            )

            # Check if this is ROCm build
            is_rocm = (
                "+rocm" in str(torch.__version__)
                or hasattr(torch.version, "hip")
                and torch.version.hip is not None
            )

            if is_amd or is_rocm:
                gpu_info.update({
                    "available": True,
                    "type": "amd",
                    "device": "cuda",  # ROCm uses cuda device string
                    "details": {
                        "device_count": torch.cuda.device_count(),
                        "device_name": device_name,
                        "memory_total": torch.cuda.get_device_properties(
                            0
                        ).total_memory,
                        "pytorch_version": torch.__version__,
                        "is_rocm_build": is_rocm,
                        "hip_version": getattr(torch.version, "hip", None),
                        "rocm_version": getattr(torch.version, "rocm", "unknown"),
                    },
                })
                logger.info(f"AMD GPU detected (ROCm): {device_name}")
            else:
                gpu_info.update({
                    "available": True,
                    "type": "nvidia",
                    "device": "cuda",
                    "details": {
                        "device_count": torch.cuda.device_count(),
                        "device_name": device_name,
                        "memory_total": torch.cuda.get_device_properties(
                            0
                        ).total_memory,
                        "cuda_version": torch.version.cuda,
                    },
                })
                logger.info(f"NVIDIA GPU detected: {device_name}")

            return gpu_info

        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            gpu_info.update({
                "available": True,
                "type": "apple",
                "device": "mps",
                "details": {
                    "device_name": "Apple Silicon GPU",
                    "pytorch_version": torch.__version__,
                },
            })
            logger.info("Apple Silicon GPU detected (MPS)")
            return gpu_info

        # No GPU detected
        logger.info("No GPU detected by PyTorch")
        gpu_info["details"]["pytorch_version"] = torch.__version__

    except ImportError:
        logger.debug("PyTorch not available, reading the GPU from sysfs")
        gpu_info["details"]["error"] = "PyTorch not installed"
    except Exception as e:
        logger.error(f"Error during GPU detection: {e}")
        gpu_info["details"]["error"] = str(e)

    sysfs_gpu = _detect_sysfs_gpu()
    if sysfs_gpu is not None:
        sysfs_gpu["details"]["pytorch_version"] = gpu_info["details"].get(
            "pytorch_version"
        )
        return sysfs_gpu

    return gpu_info


def get_optimal_device() -> str:
    """Get the optimal device string for PyTorch operations.

    Returns:
        Device string ('cuda' for CUDA/ROCm, 'mps' for Apple Silicon, 'cpu')

    """
    gpu_info = detect_gpu()
    return gpu_info["device"]


def get_gpu_memory_info() -> Optional[Dict[str, int]]:
    """Get GPU memory information if available.

    Returns:
        Dictionary with memory info or None if no GPU

    """
    try:
        import torch

        if torch.cuda.is_available():
            return {
                "total": torch.cuda.get_device_properties(0).total_memory,
                "allocated": torch.cuda.memory_allocated(0),
                "reserved": torch.cuda.memory_reserved(0),
                "free": torch.cuda.get_device_properties(0).total_memory
                - torch.cuda.memory_allocated(0),
            }
    except ImportError:
        pass
    except Exception as e:
        logger.error(f"Error getting GPU memory info: {e}")

    sysfs_gpu = _detect_sysfs_gpu()
    if sysfs_gpu is not None:
        details = sysfs_gpu["details"]
        total = details["memory_total"]
        used = details.get("memory_used") or 0
        # Card-wide usage: every process using the GPU, SD.Next included.
        return {
            "total": total,
            "allocated": used,
            "reserved": used,
            "free": total - used,
        }

    return None
