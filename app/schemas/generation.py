"""Generation and SDNext-related schemas."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SDNextGenerationParams(BaseModel):
    """Parameters for SDNext text-to-image generation."""
    
    prompt: str
    negative_prompt: Optional[str] = None
    steps: int = 20
    sampler_name: str = "DPM++ 2M"
    cfg_scale: float = 7.0
    width: int = 512
    height: int = 512
    seed: int = -1
    batch_size: int = 1
    n_iter: int = 1
    denoising_strength: Optional[float] = None


class ComposeDeliverySDNext(BaseModel):
    """SDNext delivery configuration for compose requests."""
    
    generation_params: SDNextGenerationParams
    mode: str = "immediate"
    save_images: bool = True
    return_format: str = "base64"


class SDNextDeliveryParams(BaseModel):
    """SDNext-specific delivery configuration."""
    
    generation_params: SDNextGenerationParams
    mode: str = "immediate"  # "immediate" or "deferred"
    save_images: bool = True
    return_format: str = "base64"  # "base64", "url", or "file_path"


class SDNextGenerationResult(BaseModel):
    """Result of SDNext generation operation."""
    
    job_id: str
    status: str  # "pending", "running", "completed", "failed"
    images: Optional[List[str]] = None  # base64 or file paths
    progress: Optional[float] = None  # 0.0 to 1.0
    error_message: Optional[str] = None
    generation_info: Optional[Dict[str, Any]] = None


class ProgressUpdate(BaseModel):
    """WebSocket progress update message."""
    
    job_id: str
    progress: float  # 0.0 to 1.0
    status: str  # "pending", "running", "completed", "failed"
    current_step: Optional[int] = None
    total_steps: Optional[int] = None
    eta_seconds: Optional[float] = None
    preview_image: Optional[str] = None  # base64 encoded preview
    error_message: Optional[str] = None


class GenerationStarted(BaseModel):
    """WebSocket notification that generation has started."""
    
    job_id: str
    params: SDNextGenerationParams
    estimated_duration: Optional[float] = None


class GenerationComplete(BaseModel):
    """WebSocket notification that generation is complete."""
    
    job_id: str
    status: str  # "completed" or "failed"
    images: Optional[List[str]] = None
    error_message: Optional[str] = None
    total_duration: Optional[float] = None
    generation_info: Optional[Dict[str, Any]] = None
