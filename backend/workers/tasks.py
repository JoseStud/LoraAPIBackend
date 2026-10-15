"""RQ task entrypoints and the shared worker context."""

import json
import logging
from typing import List, Optional

from rq import get_current_job

from backend.core.database import get_session_context
from backend.schemas.recommendations import BatchEmbeddingResponse
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


def process_delivery(delivery_id: str, *, context: Optional[WorkerContext] = None):
    """Worker entrypoint for jobs enqueued by :class:`RedisQueueBackend`.

    Runs the delivery once and re-raises its error, so RQ retries it under
    the policy the backend enqueued it with (``DELIVERY_MAX_RETRIES``). The
    runner leaves the job ``retrying`` while RQ has retries left and
    ``failed`` on the last attempt; an attempt that cannot claim the job
    (cancelled, finished, or still ``running`` after a timed-out attempt)
    does nothing.
    """
    logger.info(json.dumps({"event": "start", "delivery_id": delivery_id}))

    ctx = context or get_worker_context()

    with get_session_context() as sess:
        services = ctx.create_service_container(sess)
        if services.deliveries.get_job(delivery_id) is None:
            logger.warning(json.dumps({"event": "missing", "delivery_id": delivery_id}))
            return

    try:
        # Retries RQ still makes after this attempt; ``None`` outside RQ.
        retries_left = getattr(get_current_job(), "retries_left", None)
    except Exception:  # pragma: no cover - defensive branch
        retries_left = None

    try:
        ctx.delivery_runner.process_delivery_job(
            delivery_id,
            retries_left=retries_left,
            raise_on_error=True,
        )
        logger.info(json.dumps({"event": "finished", "delivery_id": delivery_id}))
    except Exception as exc:
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
        context: Optional worker context providing dependency factories

    Returns:
        Processing results as a JSON-safe
        :class:`~backend.schemas.recommendations.BatchEmbeddingResponse` dict.

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

            return BatchEmbeddingResponse.model_validate(result).model_dump(mode="json")

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
    """Run :func:`process_embeddings_batch_async` synchronously."""
    ctx = context or get_worker_context()
    return ctx.run_async(
        process_embeddings_batch_async(
            adapter_ids=adapter_ids,
            force_recompute=force_recompute,
            batch_size=batch_size,
            context=ctx,
        ),
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
        context: Optional worker context providing dependency factories

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
    """Run :func:`compute_single_embedding_async` synchronously."""
    ctx = context or get_worker_context()
    return ctx.run_async(
        compute_single_embedding_async(
            adapter_id=adapter_id,
            force_recompute=force_recompute,
            context=ctx,
        ),
    )


async def rebuild_similarity_index_async(
    force: bool = False,
    *,
    context: Optional[WorkerContext] = None,
) -> dict:
    """Background task to rebuild the similarity index.

    Args:
        force: Force rebuild even if index exists
        context: Optional worker context providing dependency factories

    Returns:
        The :class:`~backend.schemas.recommendations.IndexRebuildResponse`
        produced by the recommendation service, as a JSON-safe dict.

    """
    logger = logging.getLogger(__name__)
    ctx = context or get_worker_context()

    try:
        with get_session_context() as sess:
            services = ctx.create_service_container(sess)
            embeddings = services.recommendations.embeddings
            response = await embeddings.refresh_similarity_index(force=force)
    except Exception:
        logger.exception("Similarity index rebuild failed")
        raise

    logger.info(
        "Similarity index rebuild finished: status=%s items=%s",
        response.status,
        response.indexed_items,
    )
    return response.model_dump(mode="json")


def rebuild_similarity_index(
    force: bool = False,
    *,
    context: Optional[WorkerContext] = None,
) -> dict:
    """Run :func:`rebuild_similarity_index_async` synchronously."""
    ctx = context or get_worker_context()
    return ctx.run_async(rebuild_similarity_index_async(force=force, context=ctx))


if __name__ == "__main__":
    print(
        "Queue ready. Run workers with: "
        "rq worker --with-scheduler --url $REDIS_URL default"
    )
