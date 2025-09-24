"""Tests for generation results management endpoints."""

from __future__ import annotations

import base64
import io
import zipfile
from typing import Dict

from fastapi.testclient import TestClient

from backend.services.deliveries import DeliveryService

PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="
)


def _store_completed_job(
    delivery_service: DeliveryService,
    prompt: str,
    *,
    result_overrides: Dict[str, object] | None = None,
):
    job = delivery_service.create_job(prompt, "sdnext", {"generation_params": {"prompt": prompt}})
    payload = {
        "status": "completed",
        "images": [PNG_BASE64],
    }
    if result_overrides:
        payload.update(result_overrides)

    delivery_service.update_job_status(job.id, "succeeded", payload)
    return job


def test_download_generation_result_returns_image(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """The download endpoint streams the primary image payload."""
    job = _store_completed_job(delivery_service, "Download prompt")

    response = client.get(f"/api/v1/generation/results/{job.id}/download")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/")
    assert "attachment" in response.headers.get("content-disposition", "")

    expected_bytes = base64.b64decode(PNG_BASE64)
    assert response.content == expected_bytes


def test_delete_generation_result_removes_job(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Deleting a result removes the record and associated assets."""
    job = _store_completed_job(delivery_service, "Delete prompt")

    response = client.delete(f"/api/v1/generation/results/{job.id}")
    assert response.status_code == 204

    assert delivery_service.get_job(job.id) is None


def test_bulk_delete_generation_results(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Bulk deletion removes all specified results."""
    first = _store_completed_job(delivery_service, "Bulk A")
    second = _store_completed_job(delivery_service, "Bulk B")

    response = client.request(
        "DELETE",
        "/api/v1/generation/results/bulk-delete",
        json={"ids": [first.id, second.id]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["deleted"] == 2

    assert delivery_service.get_job(first.id) is None
    assert delivery_service.get_job(second.id) is None


def test_export_generation_results_returns_archive(
    client: TestClient,
    delivery_service: DeliveryService,
):
    """Exporting results streams a ZIP archive with metadata and assets."""
    job = _store_completed_job(delivery_service, "Export prompt")

    response = client.post(
        "/api/v1/generation/results/export",
        json={"ids": [job.id]},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers.get("content-disposition", "")

    archive_data = io.BytesIO(response.content)
    with zipfile.ZipFile(archive_data) as archive:
        names = archive.namelist()
        assert any(name.endswith("metadata.json") for name in names)
        assert any(name.endswith(".png") for name in names)

        metadata_name = next(name for name in names if name.endswith("metadata.json"))
        with archive.open(metadata_name) as meta_file:
            metadata = meta_file.read().decode("utf-8")
            assert "Export prompt" in metadata
