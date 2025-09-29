"""Recompute LoRA embeddings and rebuild the similarity index.

This migration script iterates over every adapter in the database, recomputes
its multi-modal embeddings with the current feature extraction pipeline, and
then rebuilds the similarity index from scratch. The script is intended to be
executed in staging before running in production so that operators can estimate
runtime and resource requirements.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from typing import TYPE_CHECKING, Any, Dict

from sqlmodel import select

# Ensure the project root is on the import path when the script is executed
# directly (e.g. ``python scripts/recompute_embeddings.py``).
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))

if TYPE_CHECKING:  # pragma: no cover - typing support only
    from backend.models import Adapter

LOGGER = logging.getLogger("lora.migrations.recompute_embeddings")


def _load_backend_dependencies():
    """Import backend modules lazily after patching ``sys.path`` if required."""
    if PROJECT_ROOT not in sys.path:
        sys.path.insert(0, PROJECT_ROOT)

    from backend.core.database import get_session_context, init_db
    from backend.models import Adapter
    from backend.services import create_service_container

    return {
        "get_session_context": get_session_context,
        "init_db": init_db,
        "Adapter": Adapter,
        "create_service_container": create_service_container,
    }


async def _recompute_embeddings(*, batch_size: int) -> Dict[str, Any]:
    """Recompute embeddings for every adapter and rebuild the similarity index."""
    deps = _load_backend_dependencies()
    init_db = deps["init_db"]
    get_session_context = deps["get_session_context"]
    adapter_model = deps["Adapter"]
    create_service_container = deps["create_service_container"]

    init_db()

    with get_session_context() as session:
        adapters: list["Adapter"] = list(session.exec(select(adapter_model)).all())
        adapter_ids = [adapter.id for adapter in adapters]
        LOGGER.info("Discovered %s adapters for recompute", len(adapter_ids))

        if not adapter_ids:
            LOGGER.warning("No adapters found; nothing to recompute")
            return {
                "processed_count": 0,
                "skipped_count": 0,
                "error_count": 0,
                "processing_time_seconds": 0.0,
                "index_rebuild": None,
            }

        container = create_service_container(session)
        recommendation_service = container.domain.recommendations

        LOGGER.info("Starting batch embedding recompute (batch size=%s)", batch_size)
        batch_result = await recommendation_service.embeddings.compute_batch(
            adapter_ids,
            force_recompute=True,
            batch_size=batch_size,
        )

        LOGGER.info("Rebuilding similarity index with freshly computed embeddings")
        index_response = await recommendation_service.refresh_indexes(force=True)

        LOGGER.info(
            "Similarity index rebuild finished with status '%s' (indexed %s items)",
            index_response.status,
            index_response.indexed_items,
        )

        return {
            **batch_result,
            "index_rebuild": index_response.model_dump(),
        }


def _configure_logging(verbose: bool) -> None:
    """Initialise logging configuration for the script."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(message)s")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recompute LoRA embeddings and rebuild the similarity index",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Number of adapters to embed concurrently before yielding",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging output",
    )
    return parser.parse_args()


def main() -> None:
    """Script entry point for triggering the embedding recomputation flow."""
    args = _parse_args()
    _configure_logging(args.verbose)

    LOGGER.info("Launching full embedding recompute migration")
    result = asyncio.run(_recompute_embeddings(batch_size=args.batch_size))

    LOGGER.info("Embedding recompute summary: %s", result)


if __name__ == "__main__":
    main()
