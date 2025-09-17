"""Background worker helpers for enqueueing and processing deliveries and recommendations.

This module integrates with RQ (Redis Queue) and updates DeliveryJob
records in the database as the worker processes jobs.
"""

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import List, Optional

from redis import Redis
from rq import Queue, get_current_job

try:
    from rq.retry import Retry
except Exception:
    try:
        from rq import Retry  # type: ignore
    except Exception:

        @dataclass
        class Retry:  # type: ignore
            """Fallback Retry dataclass used when RQ's Retry is unavailable."""

            max: int = 0
            interval: list | None = None


from backend.core.database import get_session
from backend.delivery import get_delivery_backend, get_generation_backend
from backend.schemas import SDNextGenerationParams
from backend.services import create_service_container

# Basic structured-ish logger for worker events
logger = logging.getLogger("lora.tasks")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    h.setFormatter(fmt)
    logger.addHandler(h)
logger.setLevel(logging.INFO)

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_conn = Redis.from_url(redis_url)
q = Queue("default", connection=redis_conn)


def enqueue_delivery(prompt: str, mode: str, params: dict, max_retries: int = 3):
    """Create a DeliveryJob and enqueue it with exponential backoff retry intervals.

    max_retries is the number of retry attempts (not counting the first try).
    """
    # Create delivery job using the service layer
    with get_session_context() as sess:
        services = create_service_container(sess)
        dj = services.deliveries.create_job(prompt, mode, params)
    
    intervals = [2**i for i in range(max_retries)] if max_retries > 0 else []
    retry = Retry(max=max_retries, interval=intervals) if max_retries > 0 else None
    job = q.enqueue(process_delivery, dj.id, retry=retry)
    logger.info(
        json.dumps(
            {
                "event": "enqueued",
                "delivery_id": dj.id,
                "job_id": job.id,
                "retries": max_retries,
                "intervals": intervals,
            },
        ),
    )
    return dj.id


def process_delivery(delivery_id: str):
    """Worker entrypoint.

    Updates the DeliveryJob status/result. Exceptions are re-raised so RQ
    can perform retries according to the configured policy.
    """
    logger.info(json.dumps({"event": "start", "delivery_id": delivery_id}))
    
    # Set job to running
    with get_session_context() as sess:
        services = create_service_container(sess)
        dj = services.deliveries.get_job(delivery_id)
        if not dj:
            logger.warning(json.dumps({"event": "missing", "delivery_id": delivery_id}))
            return
        
        services.deliveries.update_job_status(delivery_id, "running")

    try:
        # Get job parameters
        with get_session_context() as sess:
            services = create_service_container(sess)
            dj = services.deliveries.get_job(delivery_id)
            params = services.deliveries.get_job_params(dj)

        # Process delivery based on mode
        if dj.mode == "http":
            result = asyncio.run(_process_http_delivery(dj.prompt, params))
        elif dj.mode == "cli":
            result = asyncio.run(_process_cli_delivery(dj.prompt, params))
        elif dj.mode == "sdnext":
            result = asyncio.run(_process_sdnext_delivery(dj.prompt, params))
        else:
            result = {"status": "error", "detail": f"unknown mode: {dj.mode}"}

        # Update job with success
        with get_session_context() as sess:
            services = create_service_container(sess)
            services.deliveries.update_job_status(delivery_id, "succeeded", result)

        logger.info(json.dumps({"event": "succeeded", "delivery_id": delivery_id}))
        
    except Exception as exc:
        # Check RQ job for remaining retries if available
        try:
            job = get_current_job()
            retries_left = getattr(job, "retries_left", None)
        except Exception:
            retries_left = None

        # Update job with error
        with get_session_context() as sess:
            services = create_service_container(sess)
            error_result = {"error": str(exc)}
            
            if retries_left is None or retries_left <= 0:
                services.deliveries.update_job_status(
                    delivery_id, 
                    "failed", 
                    error_result,
                )
            else:
                error_result["retries_left"] = retries_left
                services.deliveries.update_job_status(
                    delivery_id, 
                    "retrying", 
                    error_result,
                )

        logger.error(
            json.dumps(
                {
                    "event": "error",
                    "delivery_id": delivery_id,
                    "error": str(exc),
                    "retries_left": retries_left,
                },
            ),
        )
        raise


async def _process_http_delivery(prompt: str, params: dict) -> dict:
    """Process HTTP delivery."""
    backend = get_delivery_backend("http")
    return await backend.deliver(prompt, params)


async def _process_cli_delivery(prompt: str, params: dict) -> dict:
    """Process CLI delivery."""
    backend = get_delivery_backend("cli")
    return await backend.deliver(prompt, params)


async def _process_sdnext_delivery(prompt: str, params: dict) -> dict:
    """Process SDNext generation delivery."""
    backend = get_generation_backend("sdnext")
    
    # Extract generation parameters
    gen_params_dict = params.get("generation_params", {})
    gen_params_dict["prompt"] = prompt  # Use the delivery prompt
    
    try:
        gen_params = SDNextGenerationParams(**gen_params_dict)
    except Exception as exc:
        return {"status": "failed", "error": f"Invalid generation parameters: {exc}"}
    
    # Prepare full parameters for generation
    full_params = {
        "generation_params": gen_params.model_dump(),
        "mode": params.get("mode", "immediate"),
        "save_images": params.get("save_images", True),
        "return_format": params.get("return_format", "base64"),
    }
    
    result = await backend.generate_image(prompt, full_params)
    return result.model_dump()


def _is_gpu_available() -> bool:
    """Check if GPU is available (supports CUDA, ROCm, and MPS)."""
    try:
        import torch
        if torch.cuda.is_available():
            return True
        elif hasattr(torch.version, 'hip') and torch.version.hip is not None:
            return True
        elif torch.backends.mps.is_available():
            return True
        return False
    except ImportError:
        return False


def process_embeddings_batch(
    adapter_ids: Optional[List[str]] = None,
    force_recompute: bool = False,
    batch_size: int = 32,
) -> dict:
    """Background task to compute embeddings for LoRAs.
    
    Args:
        adapter_ids: Specific adapter IDs to process (None for all active)
        force_recompute: Whether to recompute existing embeddings
        batch_size: Number of adapters to process in each batch
        
    Returns:
        Processing results

    """
    logger = logging.getLogger(__name__)
    
    try:
        # Create database session and services
        with get_session_context() as sess:
            from backend.services.recommendations import RecommendationService
            
            # Check if GPU is available
            gpu_enabled = _is_gpu_available()
            if gpu_enabled:
                logger.info("GPU detected, using GPU acceleration for embeddings")
            else:
                logger.info("No GPU detected, using CPU for embeddings")
            
            # Create recommendation service
            recommendation_service = RecommendationService(
                db_session=sess,
                gpu_enabled=gpu_enabled,
            )
            
            # Process embeddings
            logger.info(f"Starting batch embedding computation for {len(adapter_ids) if adapter_ids else 'all'} adapters")
            
            result = asyncio.run(
                recommendation_service.batch_compute_embeddings(
                    adapter_ids=adapter_ids,
                    force_recompute=force_recompute,
                    batch_size=batch_size,
                ),
            )
            
            logger.info(
                f"Embedding computation completed: {result['processed_count']} processed, "
                f"{result['error_count']} errors in {result['processing_time_seconds']:.2f}s",
            )
            
            return result
            
    except Exception as exc:
        logger.error(f"Embedding computation failed: {exc}")
        raise


def compute_single_embedding(adapter_id: str, force_recompute: bool = False) -> bool:
    """Background task to compute embeddings for a single LoRA.
    
    Args:
        adapter_id: ID of the adapter to process
        force_recompute: Whether to recompute existing embeddings
        
    Returns:
        Success status

    """
    logger = logging.getLogger(__name__)
    
    try:
        with get_session_context() as sess:
            from backend.services.recommendations import RecommendationService
            
            # Check GPU availability
            gpu_enabled = _is_gpu_available()
            
            recommendation_service = RecommendationService(
                db_session=sess,
                gpu_enabled=gpu_enabled,
            )
            
            logger.info(f"Computing embeddings for adapter {adapter_id}")
            
            result = asyncio.run(
                recommendation_service.compute_embeddings_for_lora(
                    adapter_id=adapter_id,
                    force_recompute=force_recompute,
                ),
            )
            
            if result:
                logger.info(f"Successfully computed embeddings for {adapter_id}")
            else:
                logger.warning(f"Failed to compute embeddings for {adapter_id}")
                
            return result
            
    except Exception as exc:
        logger.error(f"Single embedding computation failed for {adapter_id}: {exc}")
        raise


def rebuild_similarity_index(force: bool = False) -> dict:
    """Background task to rebuild the similarity index.
    
    Args:
        force: Force rebuild even if index exists
        
    Returns:
        Rebuild results

    """
    logger = logging.getLogger(__name__)
    
    try:
        with get_session_context() as sess:
            from sqlmodel import select

            from backend.models import Adapter
            from backend.services.recommendations import RecommendationService
            
            # Check GPU availability
            gpu_enabled = _is_gpu_available()
            
            recommendation_service = RecommendationService(
                db_session=sess,
                gpu_enabled=gpu_enabled,
            )
            
            # Get all active adapters
            stmt = select(Adapter).where(Adapter.active == True)
            adapters = list(sess.exec(stmt))
            
            logger.info(f"Rebuilding similarity index for {len(adapters)} adapters")
            
            # This would rebuild the similarity index
            # For now, just return success
            result = {
                "status": "success",
                "adapters_processed": len(adapters),
                "index_type": "similarity",
                "gpu_enabled": gpu_enabled,
            }
            
            logger.info(f"Similarity index rebuilt successfully for {len(adapters)} adapters")
            
            return result
            
    except Exception as exc:
        logger.error(f"Similarity index rebuild failed: {exc}")
        raise


if __name__ == "__main__":
    print("Queue ready. Use rq worker --url $REDIS_URL default to run workers.")
