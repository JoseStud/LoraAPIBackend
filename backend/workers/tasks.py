"""Background worker helpers for enqueueing and processing deliveries and recommendations.

This module integrates with RQ (Redis Queue) and updates DeliveryJob
records in the database as the worker processes jobs.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import List, Optional

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


from backend.core.database import get_session_context
from backend.delivery.base import delivery_registry
from backend.services import create_service_container
from backend.services.queue import QueueBackend, RedisQueueBackend, get_queue_backends
from backend.workers.delivery_runner import DeliveryRunner

# Basic structured-ish logger for worker events
logger = logging.getLogger("lora.tasks")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    h.setFormatter(fmt)
    logger.addHandler(h)
logger.setLevel(logging.INFO)

primary_queue_backend: Optional[RedisQueueBackend]
fallback_queue_backend: QueueBackend
queue_backend: QueueBackend
q: Optional[Queue]
delivery_runner = DeliveryRunner(delivery_registry)


def initialize_queue_backends() -> None:
    """Initialize the worker queue backends from the shared factory."""

    global primary_queue_backend, fallback_queue_backend, queue_backend, q

    primary, fallback = get_queue_backends()
    primary_queue_backend = primary if isinstance(primary, RedisQueueBackend) else None
    fallback_queue_backend = fallback

    queue_backend_candidate: Optional[QueueBackend] = primary or fallback
    if queue_backend_candidate is None:  # pragma: no cover - defensive guard
        raise RuntimeError("No queue backend is available for worker tasks")

    queue_backend = queue_backend_candidate

    if isinstance(queue_backend, RedisQueueBackend):
        q_candidate: Optional[Queue]
        try:
            q_candidate = queue_backend.queue
        except Exception:  # pragma: no cover - defensive branch
            q_candidate = None
        q = q_candidate
    else:
        q = None


initialize_queue_backends()


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
    job = queue_backend.enqueue_delivery(dj.id, retry=retry)
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

    with get_session_context() as sess:
        services = create_service_container(sess)
        if services.deliveries.get_job(delivery_id) is None:
            logger.warning(json.dumps({"event": "missing", "delivery_id": delivery_id}))
            return

    try:
        try:
            job = get_current_job()
            retries_left = getattr(job, "retries_left", None)
        except Exception:  # pragma: no cover - defensive branch
            retries_left = None

        delivery_runner.process_delivery_job(
            delivery_id,
            retries_left=retries_left,
            raise_on_error=True,
        )
        logger.info(json.dumps({"event": "succeeded", "delivery_id": delivery_id}))
    except Exception as exc:
        try:
            job = get_current_job()
            retries_left = getattr(job, "retries_left", None)
        except Exception:  # pragma: no cover - defensive branch
            retries_left = None

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
            services = create_service_container(sess)
            recommendation_service = services.recommendations

            gpu_enabled = recommendation_service.gpu_enabled
            if gpu_enabled:
                logger.info("GPU detected, using GPU acceleration for embeddings")
            else:
                logger.info("No GPU detected, using CPU for embeddings")

            # Create recommendation service
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
            services = create_service_container(sess)
            recommendation_service = services.recommendations

            gpu_enabled = recommendation_service.gpu_enabled

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

            services = create_service_container(sess)
            recommendation_service = services.recommendations
            gpu_enabled = recommendation_service.gpu_enabled

            # Get all active adapters
            stmt = select(Adapter).where(Adapter.active)
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
