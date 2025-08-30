"""SDNext generation delivery implementation."""

import asyncio
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import aiohttp

from app.core.config import settings
from app.schemas import SDNextGenerationResult

from .base import GenerationBackend


class SDNextGenerationBackend(GenerationBackend):
    """SDNext generation backend implementation."""
    
    def __init__(self):
        """Initialize SDNext backend."""
        self.base_url = settings.SDNEXT_BASE_URL
        self.username = settings.SDNEXT_USERNAME
        self.password = settings.SDNEXT_PASSWORD
        self.timeout = settings.SDNEXT_TIMEOUT
        self.poll_interval = settings.SDNEXT_POLL_INTERVAL
        self.output_dir = settings.SDNEXT_OUTPUT_DIR
        
        # Session for persistent connections
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            auth = None
            if self.username and self.password:
                auth = aiohttp.BasicAuth(self.username, self.password)
            
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                auth=auth,
            )
        return self._session
    
    async def close(self) -> None:
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    def is_available(self) -> bool:
        """Check if SDNext backend is configured and available."""
        return self.base_url is not None
    
    async def _health_check(self) -> bool:
        """Check if SDNext API is responsive."""
        if not self.is_available():
            return False
        
        try:
            session = await self._get_session()
            url = f"{self.base_url}/sdapi/v1/options"
            async with session.get(url) as response:
                return response.status == 200
        except Exception:
            return False
    
    async def generate_image(self, prompt: str, params: Dict[str, Any]) -> SDNextGenerationResult:
        """Generate image using SDNext API.
        
        Args:
            prompt: The composed prompt
            params: Generation parameters
            
        Returns:
            SDNextGenerationResult with job status

        """
        if not self.is_available():
            return SDNextGenerationResult(
                job_id=str(uuid4()),
                status="failed",
                error_message="SDNext backend not configured",
            )
        
        # Check if API is available
        if not await self._health_check():
            return SDNextGenerationResult(
                job_id=str(uuid4()),
                status="failed",
                error_message="SDNext API not available",
            )
        
        # Extract generation parameters
        gen_params = params.get("generation_params", {})
        mode = params.get("mode", "immediate")
        save_images = params.get("save_images", True)
        return_format = params.get("return_format", "base64")
        
        # Prepare SDNext API payload
        payload = {
            "prompt": prompt,
            "negative_prompt": gen_params.get("negative_prompt", ""),
            "steps": gen_params.get("steps", settings.SDNEXT_DEFAULT_STEPS),
            "sampler_name": gen_params.get("sampler_name", settings.SDNEXT_DEFAULT_SAMPLER),
            "cfg_scale": gen_params.get("cfg_scale", settings.SDNEXT_DEFAULT_CFG_SCALE),
            "width": gen_params.get("width", 512),
            "height": gen_params.get("height", 512),
            "seed": gen_params.get("seed", -1),
            "batch_size": gen_params.get("batch_size", 1),
            "n_iter": gen_params.get("n_iter", 1),
        }
        
        if gen_params.get("denoising_strength") is not None:
            payload["denoising_strength"] = gen_params["denoising_strength"]
        
        job_id = str(uuid4())
        
        try:
            session = await self._get_session()
            url = f"{self.base_url}/sdapi/v1/txt2img"
            
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    return SDNextGenerationResult(
                        job_id=job_id,
                        status="failed",
                        error_message=f"SDNext API error: {response.status} - {error_text}",
                    )
                
                result = await response.json()
                
                # Process images
                images = []
                if "images" in result and result["images"]:
                    images = await self._process_images(
                        result["images"], 
                        job_id, 
                        save_images, 
                        return_format,
                    )
                
                return SDNextGenerationResult(
                    job_id=job_id,
                    status="completed",
                    images=images,
                    progress=1.0,
                    generation_info=result.get("info", {}),
                )
                
        except asyncio.TimeoutError:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=f"Generation timeout after {self.timeout}s",
            )
        except Exception as exc:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )
    
    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        """Check generation progress.
        
        Note: SDNext typically completes immediately, so this is mostly
        for compatibility with the interface.
        
        Args:
            job_id: Generation job ID
            
        Returns:
            SDNextGenerationResult with current status

        """
        if not self.is_available():
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message="SDNext backend not configured",
            )
        
        try:
            session = await self._get_session()
            url = f"{self.base_url}/sdapi/v1/progress"
            
            async with session.get(url) as response:
                if response.status != 200:
                    return SDNextGenerationResult(
                        job_id=job_id,
                        status="unknown",
                        error_message="Could not check progress",
                    )
                
                progress_data = await response.json()
                progress = progress_data.get("progress", 0.0)
                
                status = "running" if progress < 1.0 else "completed"
                if progress == 0.0:
                    status = "pending"
                
                return SDNextGenerationResult(
                    job_id=job_id,
                    status=status,
                    progress=progress,
                )
                
        except Exception as exc:
            return SDNextGenerationResult(
                job_id=job_id,
                status="failed",
                error_message=str(exc),
            )
    
    async def _process_images(
        self, 
        images: List[str], 
        job_id: str, 
        save_images: bool, 
        return_format: str,
    ) -> List[str]:
        """Process generated images according to format and save options.
        
        Args:
            images: List of base64 encoded images
            job_id: Generation job ID
            save_images: Whether to save images to disk
            return_format: "base64", "file_path", or "url"
            
        Returns:
            List of processed image references

        """
        processed = []
        
        for i, img_b64 in enumerate(images):
            try:
                if return_format == "base64":
                    processed.append(img_b64)
                elif return_format == "file_path" or save_images:
                    # Save to disk
                    file_path = await self._save_image(img_b64, job_id, i)
                    if return_format == "file_path":
                        processed.append(file_path)
                    else:
                        processed.append(img_b64)  # Still return base64 if requested
                elif return_format == "url":
                    # For URL format, we'd need a web server serving the files
                    # For now, save and return file path
                    file_path = await self._save_image(img_b64, job_id, i)
                    processed.append(f"file://{file_path}")
                else:
                    processed.append(img_b64)  # Default to base64
                    
            except Exception as exc:
                # Log error but continue with other images
                print(f"Error processing image {i}: {exc}")
                continue
        
        return processed
    
    async def _save_image(self, img_b64: str, job_id: str, index: int) -> str:
        """Save base64 image to disk.
        
        Args:
            img_b64: Base64 encoded image
            job_id: Generation job ID
            index: Image index
            
        Returns:
            File path where image was saved

        """
        # Create output directory if specified
        if self.output_dir:
            output_path = Path(self.output_dir)
        else:
            output_path = Path.cwd() / "generated_images"
        
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{job_id}_{timestamp}_{index:03d}.png"
        file_path = output_path / filename
        
        # Decode and save image
        img_data = base64.b64decode(img_b64)
        with open(file_path, "wb") as f:
            f.write(img_data)
        
        return str(file_path)
    
    def get_backend_name(self) -> str:
        """Return backend name."""
        return "sdnext"
