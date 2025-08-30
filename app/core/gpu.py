"""GPU detection and configuration utilities."""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def detect_gpu() -> Dict[str, Any]:
    """Detect available GPU and return configuration info.
    
    Returns:
        Dictionary with GPU information including:
        - available: bool - Whether GPU is available
        - type: str - 'amd', 'nvidia', or 'cpu'
        - device: str - Device string for PyTorch
        - details: dict - Additional GPU information
    """
    gpu_info = {
        'available': False,
        'type': 'cpu',
        'device': 'cpu',
        'details': {}
    }
    
    try:
        import torch
        
        # Check for CUDA/ROCm
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            
            # Detect if this is AMD GPU (common AMD GPU names)
            is_amd = any(amd_identifier in device_name.lower() for amd_identifier in [
                'amd', 'radeon', 'rx ', 'vega', 'navi', 'rdna', 'gfx'
            ])
            
            # Check if this is ROCm build
            is_rocm = (
                '+rocm' in str(torch.__version__) or
                hasattr(torch.version, 'hip') and torch.version.hip is not None
            )
            
            if is_amd or is_rocm:
                gpu_info.update({
                    'available': True,
                    'type': 'amd',
                    'device': 'cuda',  # ROCm uses cuda device string
                    'details': {
                        'device_count': torch.cuda.device_count(),
                        'device_name': device_name,
                        'memory_total': torch.cuda.get_device_properties(0).total_memory,
                        'pytorch_version': torch.__version__,
                        'is_rocm_build': is_rocm,
                        'hip_version': getattr(torch.version, 'hip', None),
                        'rocm_version': getattr(torch.version, 'rocm', 'unknown')
                    }
                })
                logger.info(f"AMD GPU detected (ROCm): {device_name}")
            else:
                gpu_info.update({
                    'available': True,
                    'type': 'nvidia',
                    'device': 'cuda',
                    'details': {
                        'device_count': torch.cuda.device_count(),
                        'device_name': device_name,
                        'memory_total': torch.cuda.get_device_properties(0).total_memory,
                        'cuda_version': torch.version.cuda
                    }
                })
                logger.info(f"NVIDIA GPU detected: {device_name}")
            
            return gpu_info
        
        # No GPU detected
        logger.info("No GPU detected, using CPU")
        gpu_info['details']['pytorch_version'] = torch.__version__
        
    except ImportError:
        logger.warning("PyTorch not available, GPU detection disabled")
        gpu_info['details']['error'] = 'PyTorch not installed'
    except Exception as e:
        logger.error(f"Error during GPU detection: {e}")
        gpu_info['details']['error'] = str(e)
    
    return gpu_info


def get_optimal_device() -> str:
    """Get the optimal device string for PyTorch operations.
    
    Returns:
        Device string ('cuda' for GPU, 'cpu' for CPU)
    """
    gpu_info = detect_gpu()
    return gpu_info['device']


def get_gpu_memory_info() -> Optional[Dict[str, int]]:
    """Get GPU memory information if available.
    
    Returns:
        Dictionary with memory info or None if no GPU
    """
    try:
        import torch
        
        if torch.cuda.is_available():
            return {
                'total': torch.cuda.get_device_properties(0).total_memory,
                'allocated': torch.cuda.memory_allocated(0),
                'reserved': torch.cuda.memory_reserved(0),
                'free': torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated(0)
            }
    except Exception as e:
        logger.error(f"Error getting GPU memory info: {e}")
    
    return None
