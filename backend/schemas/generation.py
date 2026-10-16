"""Generation and SDNext-related schemas."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

from backend.utils.progress import PROGRESS_DESCRIPTION


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


class GenerationMode(str, Enum):
    """Supported orchestration modes for generation requests."""

    IMMEDIATE = "immediate"
    DEFERRED = "deferred"


class GenerationResultFormat(str, Enum):
    """Accepted result serialization strategies for generation responses."""

    BASE64 = "base64"
    FILE_PATH = "file_path"
    URL = "url"


class ComposeDeliverySDNext(BaseModel):
    """SDNext delivery configuration for compose requests."""

    generation_params: SDNextGenerationParams
    mode: GenerationMode = GenerationMode.IMMEDIATE
    save_images: bool = True
    return_format: GenerationResultFormat = GenerationResultFormat.BASE64


class SDNextDeliveryParams(BaseModel):
    """SDNext-specific delivery configuration."""

    generation_params: SDNextGenerationParams
    mode: GenerationMode = GenerationMode.IMMEDIATE
    save_images: bool = True
    return_format: GenerationResultFormat = GenerationResultFormat.BASE64


class SDNextGenerationResult(BaseModel):
    """Result of SDNext generation operation."""

    # A generation backend returns this from ``generate_image`` (``job_id`` is
    # then its own output id and ``images`` what its storage produced); the
    # API's ``/generate``, ``/compose-and-generate`` and ``/progress`` answer
    # with it for a delivery job (``job_id`` is the job's id, ``status`` the UI
    # vocabulary and ``images`` browser-loadable sources).
    job_id: str
    status: str
    images: Optional[List[str]] = None
    progress: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description=PROGRESS_DESCRIPTION
    )
    error_message: Optional[str] = None
    generation_info: Optional[Dict[str, Any]] = None


class ProgressUpdate(BaseModel):
    """WebSocket progress update message."""

    job_id: str
    progress: float = Field(ge=0.0, le=1.0, description=PROGRESS_DESCRIPTION)
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


class GenerationJobStatus(BaseModel):
    """Summary of an active generation job for queue displays."""

    id: str
    jobId: Optional[str] = None
    prompt: Optional[str] = None
    status: str
    progress: float = Field(
        default=0.0, ge=0.0, le=1.0, description=PROGRESS_DESCRIPTION
    )
    message: Optional[str] = None
    error: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    startTime: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None


class GenerationCancelResponse(BaseModel):
    """Response returned when cancelling a generation job."""

    success: bool = True
    status: str
    message: Optional[str] = None


class GenerationResultSummary(BaseModel):
    """Summary of a completed generation result."""

    id: str
    job_id: str
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    status: str
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    steps: Optional[int] = None
    cfg_scale: Optional[float] = None
    seed: Optional[int] = None
    created_at: datetime
    finished_at: Optional[datetime] = None
    generation_info: Optional[Dict[str, Any]] = None
    rating: Optional[int] = None
    is_favorite: bool = False
    rating_updated_at: Optional[datetime] = None
    favorite_updated_at: Optional[datetime] = None


class GenerationBulkDeleteRequest(BaseModel):
    """Request payload for bulk deletion of generation results."""

    ids: List[Union[str, int]] = Field(default_factory=list)


class GenerationExportRequest(BaseModel):
    """Request payload for exporting generation results."""

    ids: List[Union[str, int]] = Field(default_factory=list)
    include_metadata: bool = True
