"""Generation service for SDNext integration."""

from typing import Dict, List, Optional

from app.delivery import get_generation_backend
from app.schemas import SDNextGenerationParams, SDNextGenerationResult


class GenerationService:
    """Service for image generation operations."""

    def __init__(self):
        """Initialize GenerationService."""
        pass

    async def generate_image(
        self, 
        prompt: str, 
        backend_name: str = "sdnext",
        generation_params: Optional[SDNextGenerationParams] = None,
        **kwargs,
    ) -> SDNextGenerationResult:
        """Generate an image using the specified backend.
        
        Args:
            prompt: The prompt to generate from
            backend_name: Name of the generation backend
            generation_params: Generation parameters
            **kwargs: Additional backend-specific parameters
            
        Returns:
            SDNextGenerationResult with generation status and results

        """
        try:
            backend = get_generation_backend(backend_name)
        except ValueError as e:
            return SDNextGenerationResult(
                job_id="unknown",
                status="failed",
                error_message=str(e),
            )
        
        # Prepare parameters
        params = kwargs.copy()
        if generation_params:
            params["generation_params"] = generation_params.model_dump()
        
        return await backend.generate_image(prompt, params)

    async def check_generation_progress(
        self, 
        job_id: str, 
        backend_name: str = "sdnext",
    ) -> SDNextGenerationResult:
        """Check the progress of a generation job.
        
        Args:
            job_id: Generation job ID
            backend_name: Name of the generation backend
            
        Returns:
            SDNextGenerationResult with current status

        """
        try:
            backend = get_generation_backend(backend_name)
        except ValueError as e:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(e),
            )
        
        return await backend.check_progress(job_id)

    async def list_available_backends(self) -> Dict[str, bool]:
        """List available generation backends and their status.
        
        Returns:
            Dict mapping backend names to availability status

        """
        from app.delivery.base import delivery_registry
        
        backends_info = delivery_registry.list_available_backends()
        return backends_info.get("generation", {})

    async def validate_generation_params(
        self, 
        params: SDNextGenerationParams,
    ) -> List[str]:
        """Validate generation parameters and return warnings.
        
        Args:
            params: Generation parameters to validate
            
        Returns:
            List of validation warning messages

        """
        warnings = []
        
        # Check prompt
        if not params.prompt.strip():
            warnings.append("Empty prompt provided")
        
        # Check dimensions
        if params.width <= 0 or params.height <= 0:
            warnings.append("Invalid image dimensions")
        elif params.width * params.height > 2048 * 2048:
            warnings.append("Very large image dimensions may cause memory issues")
        
        # Check steps
        if params.steps < 1:
            warnings.append("Steps must be at least 1")
        elif params.steps > 100:
            warnings.append("High step count may take very long to generate")
        
        # Check CFG scale
        if params.cfg_scale < 1.0:
            warnings.append("CFG scale below 1.0 may produce poor results")
        elif params.cfg_scale > 20.0:
            warnings.append("Very high CFG scale may cause artifacts")
        
        # Check batch size
        if params.batch_size < 1:
            warnings.append("Batch size must be at least 1")
        elif params.batch_size > 8:
            warnings.append("Large batch size may cause memory issues")
        
        return warnings

    def get_default_params(self) -> SDNextGenerationParams:
        """Get default generation parameters.
        
        Returns:
            SDNextGenerationParams with default values

        """
        from app.core.config import settings
        
        return SDNextGenerationParams(
            prompt="",
            steps=settings.SDNEXT_DEFAULT_STEPS,
            sampler_name=settings.SDNEXT_DEFAULT_SAMPLER,
            cfg_scale=settings.SDNEXT_DEFAULT_CFG_SCALE,
        )
