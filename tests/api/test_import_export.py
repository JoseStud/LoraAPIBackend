"""Tests for import/export API endpoints."""

from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.services.storage import get_storage_service


def test_import_export_streams_archive(
    client: TestClient,
    mock_storage: MagicMock,
    tmp_path,
):
    """The import/export export endpoint should stream a ZIP archive."""
    adapter_file = tmp_path / "adapter.safetensors"
    adapter_file.write_bytes(b"fake-weights")

    def _path_exists(path: str) -> bool:
        return Path(path).exists()

    mock_storage.exists.side_effect = _path_exists

    storage_service = get_storage_service()
    storage_service.backend.get_file_size = (
        lambda path: Path(path).stat().st_size if Path(path).exists() else 0
    )

    create_payload = {
        "name": "export-test",
        "version": "v1",
        "file_path": str(adapter_file),
        "weight": 1.0,
    }

    create_response = client.post("/api/v1/adapters", json=create_payload)
    assert create_response.status_code == 201

    export_response = client.post(
        "/api/v1/export",
        json={"loras": True, "format": "zip"},
    )

    assert export_response.status_code == 200
    assert export_response.headers.get("content-type") == "application/zip"
    disposition = export_response.headers.get("content-disposition", "")
    assert "attachment; filename=" in disposition
    assert export_response.content.startswith(b"PK\x03\x04")
    assert len(export_response.content) > 0
