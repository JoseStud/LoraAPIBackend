"""Controllers for generation result endpoints."""

from __future__ import annotations

from typing import Iterable, Sequence

from fastapi import HTTPException

from backend.schemas import GenerationResultSummary
from backend.services import ApplicationServices, CoreServices
from backend.services.delivery_results.models import ResultArchive, ResultDownload

from ..presenters.results import build_result

__all__ = [
    "list_results",
    "bulk_delete_results",
    "delete_result",
    "prepare_results_archive",
    "prepare_result_download",
]


def list_results(
    *,
    application: ApplicationServices,
    limit: int,
    offset: int,
) -> list[GenerationResultSummary]:
    """Return recent completed generation results."""
    jobs = application.deliveries.list_jobs(
        status="succeeded", limit=limit, offset=offset
    )
    coordinator = application.generation_coordinator
    return [build_result(job, coordinator) for job in jobs]


def bulk_delete_results(
    *,
    application: ApplicationServices,
    core: CoreServices,
    target_ids: Iterable[str],
) -> int:
    """Delete multiple generation results in a single request."""
    return application.deliveries.bulk_delete_job_results(
        list(target_ids),
        storage=core.storage,
        coordinator=application.generation_coordinator,
    )


def delete_result(
    *,
    application: ApplicationServices,
    core: CoreServices,
    result_id: str,
) -> None:
    """Delete a stored generation result and its associated artifacts."""
    deleted = application.deliveries.delete_job_result(
        result_id,
        storage=core.storage,
        coordinator=application.generation_coordinator,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Result not found")


def prepare_results_archive(
    *,
    application: ApplicationServices,
    core: CoreServices,
    target_ids: Sequence[str],
    include_metadata: bool,
) -> ResultArchive:
    """Create a streaming archive containing the requested generation results."""
    archive = application.deliveries.build_results_archive(
        target_ids,
        storage=core.storage,
        coordinator=application.generation_coordinator,
        include_metadata=include_metadata,
    )
    if archive is None:
        raise HTTPException(status_code=404, detail="No results found")
    return archive


def prepare_result_download(
    *,
    application: ApplicationServices,
    core: CoreServices,
    result_id: str,
) -> ResultDownload:
    """Prepare a download payload for a generation result's primary asset."""
    job = application.deliveries.get_job(result_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Result not found")

    payload = application.deliveries.build_result_download(
        job,
        storage=core.storage,
        coordinator=application.generation_coordinator,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Result asset is unavailable")
    return payload
