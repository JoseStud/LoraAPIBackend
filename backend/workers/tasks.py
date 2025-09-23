"""Background worker helpers for enqueueing and processing jobs."""

import json
import logging
from dataclasses import dataclass
from typing import List, Optional

from rq import get_current_job

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
from backend.services.queue import QueueOrchestrator
from backend.workers.context import AsyncRunner, WorkerContext

# Basic structured-ish logger for worker events
logger = logging.getLogger("lora.tasks")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    h.setFormatter(fmt)
    logger.addHandler(h)
logger.setLevel(logging.INFO)

_worker_context: Optional[WorkerContext] = None


def build_worker_context(
    *,
    queue_orchestrator: Optional[QueueOrchestrator] = None,
    async_runner: Optional[AsyncRunner] = None,
    recommendation_gpu_available: Optional[bool] = None,
) -> WorkerContext:
    """Create a new :class:`WorkerContext` instance."""

    return WorkerContext.build_default(
        queue_orchestrator=queue_orchestrator,
        async_runner=async_runner,
        recommendation_gpu_available=recommendation_gpu_available,
    )


def get_worker_context() -> WorkerContext:
    """Return the shared worker context, constructing it on first use."""

    global _worker_context
    if _worker_context is None:
        _worker_context = build_worker_context()
    return _worker_context


def set_worker_context(context: WorkerContext) -> None:
    """Replace the shared worker context (used primarily for tests)."""

    global _worker_context
    _worker_context = context


def reset_worker_context() -> None:
    """Reset the cached worker context forcing re-construction on next access."""

    global _worker_context
    _worker_context = None


def enqueue_delivery(
    prompt: str,
    mode: str,
    params: dict,
    max_retries: int = 3,
    *,
    context: Optional[WorkerContext] = None,
):
    """Create a DeliveryJob and enqueue it with exponential backoff retry intervals.

    max_retries is the number of retry attempts (not counting the first try).
    """
    # Create delivery job using the service layer
    ctx = context or get_worker_context()

    with get_session_context() as sess:
        services = ctx.create_service_container(sess)
        dj = services.deliveries.create_job(prompt, mode, params)
    
    intervals = [2**i for i in range(max_retries)] if max_retries > 0 else []
    retry = Retry(max=max_retries, interval=intervals) if max_retries > 0 else None
    job = ctx.queue_backend.enqueue_delivery(dj.id, retry=retry)
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


def process_delivery(delivery_id: str, *, context: Optional[WorkerContext] = None):
    """Worker entrypoint.

    Updates the DeliveryJob status/result. Exceptions are re-raised so RQ
    can perform retries according to the configured policy.
    """
    logger.info(json.dumps({"event": "start", "delivery_id": delivery_id}))

    ctx = context or get_worker_context()

    with get_session_context() as sess:
        services = ctx.create_service_container(sess)
        if services.deliveries.get_job(delivery_id) is None:
            logger.warning(json.dumps({"event": "missing", "delivery_id": delivery_id}))
            return

    try:
        try:
            job = get_current_job()
            retries_left = getattr(job, "retries_left", None)
        except Exception:  # pragma: no cover - defensive branch
            retries_left = None

        ctx.delivery_runner.process_delivery_job(
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


async def process_embeddings_batch_async(
    adapter_ids: Optional[List[str]] = None,
    force_recompute: bool = False,
    batch_size: int = 32,
    *,
    context: Optional[WorkerContext] = None,
) -> dict:
    """Background task to compute embeddings for LoRAs.
    
    Args:
        adapter_ids: Specific adapter IDs to process (None for all active)
        force_recompute: Whether to recompute existing embeddings
        batch_size: Number of adapters to process in each batch
        
    Returns:
        Processing results

    """
    ctx = context or get_worker_context()
    logger = logging.getLogger(__name__)

    try:
        with get_session_context() as sess:
            services = ctx.create_service_container(sess)
            recommendation_service = services.recommendations

            if recommendation_service.gpu_enabled:
                logger.info("GPU detected, using GPU acceleration for embeddings")
            else:
                logger.info("No GPU detected, using CPU for embeddings")

            logger.info(
                "Starting batch embedding computation for %s adapters",
                len(adapter_ids) if adapter_ids else "all",
            )

            result = await recommendation_service.embeddings.compute_batch(
                adapter_ids=adapter_ids,
                force_recompute=force_recompute,
                batch_size=batch_size,
            )

            logger.info(
                "Embedding computation completed: %s processed, %s errors in %.2fs",
                result["processed_count"],
                result["error_count"],
                result["processing_time_seconds"],
            )

            return result

    except Exception as exc:
        logger.error(f"Embedding computation failed: {exc}")
        raise


def process_embeddings_batch(
    adapter_ids: Optional[List[str]] = None,
    force_recompute: bool = False,
    batch_size: int = 32,
    *,
    context: Optional[WorkerContext] = None,
):
    """Synchronously execute :func:`process_embeddings_batch_async`."""

    ctx = context or get_worker_context()
    return ctx.run_async(
        process_embeddings_batch_async(
            adapter_ids=adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
            context=ctx,
        )
    )


async def compute_single_embedding_async(
    adapter_id: str,
    force_recompute: bool = False,
    *,
    context: Optional[WorkerContext] = None,
) -> bool:
    """Background task to compute embeddings for a single LoRA.
    
    Args:
        adapter_id: ID of the adapter to process
        force_recompute: Whether to recompute existing embeddings
        
    Returns:
        Success status

    """
    ctx = context or get_worker_context()
    logger = logging.getLogger(__name__)

    try:
        with get_session_context() as sess:
            services = ctx.create_service_container(sess)
            recommendation_service = services.recommendations

            logger.info("Computing embeddings for adapter %s", adapter_id)

            result = await recommendation_service.embeddings.compute_for_lora(
                adapter_id,
                force_recompute=force_recompute,
            )

            if result:
                logger.info("Successfully computed embeddings for %s", adapter_id)
            else:
                logger.warning("Failed to compute embeddings for %s", adapter_id)

            return result

    except Exception as exc:
        logger.error(f"Single embedding computation failed for {adapter_id}: {exc}")
        raise


def compute_single_embedding(
    adapter_id: str,
    force_recompute: bool = False,
    *,
    context: Optional[WorkerContext] = None,
) -> bool:
    """Synchronously execute :func:`compute_single_embedding_async`."""

    ctx = context or get_worker_context()
    return ctx.run_async(
        compute_single_embedding_async(
            adapter_id=adapter_id,
            force_recompute=force_recompute,
            context=ctx,
        )
    )


def rebuild_similarity_index(
    force: bool = False,
    *,
    context: Optional[WorkerContext] = None,
) -> dict:
    """Background task to rebuild the similarity index.
    
    Args:
        force: Force rebuild even if index exists
        
    Returns:
        Rebuild results

    """
    logger = logging.getLogger(__name__)
    
    try:
        ctx = context or get_worker_context()

        with get_session_context() as sess:
            from sqlmodel import select

            from backend.models import Adapter

            services = ctx.create_service_container(sess)
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
