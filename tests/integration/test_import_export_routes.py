"""Integration tests for import/export API endpoints."""

import io
import json
import zipfile
from pathlib import Path

import pytest
from sqlmodel import select

from backend.core.config import settings
from backend.models import Adapter
from backend.services.adapters import AdapterService
from backend.services.archive import ArchiveService
from backend.services.storage import LocalFileSystemStorage, StorageService


def _create_adapter(db_session, weights_path: Path) -> Adapter:
    adapter = Adapter(
        name=weights_path.stem,
        version="1",
        file_path=str(weights_path),
        primary_file_local_path=str(weights_path),
    )
    db_session.add(adapter)
    db_session.commit()
    db_session.refresh(adapter)
    return adapter


def _build_archive_bytes(db_session) -> bytes:
    storage = StorageService(LocalFileSystemStorage())
    adapter_service = AdapterService(db_session, storage.backend)
    archive_service = ArchiveService(adapter_service, storage)
    archive = archive_service.build_export_archive()
    return b"".join(archive.iterator)


def test_export_endpoint_streams_archive(client, db_session, tmp_path, dist_dir):
    weights_path = tmp_path / "alpha.safetensors"
    weights_path.write_bytes(b"alpha-weights")
    _create_adapter(db_session, weights_path)

    response = client.post(
        "/api/v1/export",
        json={"loras": True, "format": "zip"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert "Content-Disposition" in response.headers

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = archive.namelist()
    assert "manifest.json" in names

    manifest = json.loads(archive.read("manifest.json"))
    assert manifest["adapter_count"] == 1
    assert manifest["adapters"]
    assert any(name.endswith("alpha.safetensors") for name in names)


def test_export_estimate_endpoint_reflects_current_data(
    client, db_session, tmp_path, dist_dir
):
    weights_path = tmp_path / "beta.safetensors"
    weights_path.write_bytes(b"beta-weights")
    _create_adapter(db_session, weights_path)

    response = client.post(
        "/api/v1/export/estimate",
        json={"loras": True, "format": "zip"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["size"]
    assert payload["size"] != "0 Bytes"
    assert payload["time"] != "0 seconds"


def test_import_endpoint_creates_adapter(
    client, db_session, tmp_path, monkeypatch, dist_dir
):
    monkeypatch.setattr(settings, "IMPORT_PATH", str(dist_dir))

    weights_path = tmp_path / "gamma.safetensors"
    weights_path.write_bytes(b"gamma-weights")
    original = _create_adapter(db_session, weights_path)
    archive_bytes = _build_archive_bytes(db_session)

    # Simulate importing into an empty database
    for adapter in db_session.exec(select(Adapter)).all():
        db_session.delete(adapter)
    db_session.commit()

    files = [
        ("files", ("export.zip", io.BytesIO(archive_bytes), "application/zip")),
    ]
    data = {
        "config": json.dumps(
            {"mode": "merge", "validate": True, "backup_before": False}
        )
    }

    response = client.post(
        "/api/v1/import",
        files=files,
        data=data,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["processed_files"] == 1
    assert payload["results"][0]["status"] == "imported"

    adapters = db_session.exec(select(Adapter)).all()
    assert len(adapters) == 1
    stored = adapters[0]
    assert stored.name == original.name
    assert stored.primary_file_local_path
    extracted_path = Path(stored.primary_file_local_path)
    assert extracted_path.exists()
    assert dist_dir in extracted_path.parents


def test_import_endpoint_rejects_invalid_archive(
    client, db_session, tmp_path, monkeypatch, dist_dir
):
    monkeypatch.setattr(settings, "IMPORT_PATH", str(dist_dir))

    invalid_stream = io.BytesIO()
    with zipfile.ZipFile(invalid_stream, "w") as archive:
        archive.writestr("README.txt", "missing manifest")
    invalid_stream.seek(0)

    files = [
        ("files", ("invalid.zip", invalid_stream, "application/zip")),
    ]
    data = {
        "config": json.dumps(
            {"mode": "merge", "validate": True, "backup_before": False}
        )
    }

    response = client.post(
        "/api/v1/import",
        files=files,
        data=data,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is False
    assert payload["processed_files"] == 0
    assert payload["results"][0]["status"] == "error"
    assert "manifest" in payload["results"][0]["detail"].lower()
    assert db_session.exec(select(Adapter)).all() == []


@pytest.fixture
def dist_dir(tmp_path: Path) -> Path:
    """Create a temporary dist directory for export tests."""
    dist = tmp_path / "dist"
    dist.mkdir(parents=True, exist_ok=True)
    return dist
