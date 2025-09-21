"""Integration tests for import/export API endpoints."""

import io
import json
import zipfile
from pathlib import Path

from sqlmodel import select

from backend.core.config import settings
from backend.models import Adapter
from backend.services.adapters import AdapterService
from backend.services.archive import ArchiveService
from backend.services.storage import LocalFileSystemStorage, StorageService

_DIST_DIR = Path("/workspace/LoraAPIBackend/dist")


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


def test_export_endpoint_streams_archive(client, db_session, tmp_path):
    _DIST_DIR.mkdir(parents=True, exist_ok=True)
    weights = tmp_path / "api_export.safetensors"
    weights.write_bytes(b"data" * 256)
    adapter = _create_adapter(db_session, weights)

    response = client.post("/api/v1/export", json={"loras": True})
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest["adapter_count"] == 1
        assert manifest["adapters"][0]["id"] == adapter.id


def test_export_estimate_endpoint_reflects_current_data(client, db_session, tmp_path):
    _DIST_DIR.mkdir(parents=True, exist_ok=True)
    weights = tmp_path / "estimate_api.safetensors"
    weights.write_bytes(b"a" * 2048)
    _create_adapter(db_session, weights)

    response = client.post("/api/v1/export/estimate", json={"loras": True})
    assert response.status_code == 200
    payload = response.json()
    assert payload["size"] != "0 Bytes"
    assert "minutes" in payload["time"] or "seconds" in payload["time"]


def test_import_endpoint_creates_adapter(client, db_session, tmp_path, monkeypatch):
    _DIST_DIR.mkdir(parents=True, exist_ok=True)
    weights = tmp_path / "import_api.safetensors"
    weights.write_bytes(b"b" * 1024)
    adapter = _create_adapter(db_session, weights)

    archive_bytes = _build_archive_bytes(db_session)

    db_session.delete(adapter)
    db_session.commit()

    target_dir = tmp_path / "imported_api"
    monkeypatch.setattr(settings, "IMPORT_PATH", str(target_dir), raising=False)

    response = client.post(
        "/api/v1/import",
        data={"config": json.dumps({"mode": "merge"})},
        files=[("files", ("export.zip", archive_bytes, "application/zip"))],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["processed_files"] == 1
    stored = db_session.exec(select(Adapter).where(Adapter.name == weights.stem)).first()
    assert stored is not None
    assert Path(stored.file_path).exists()


def test_import_endpoint_rejects_invalid_archive(client, db_session, tmp_path, monkeypatch):
    _DIST_DIR.mkdir(parents=True, exist_ok=True)
    target_dir = tmp_path / "invalid_import"
    monkeypatch.setattr(settings, "IMPORT_PATH", str(target_dir), raising=False)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("broken.txt", "no manifest")
    archive_bytes = buffer.getvalue()

    response = client.post(
        "/api/v1/import",
        data={"config": json.dumps({"mode": "merge"})},
        files=[("files", ("broken.zip", archive_bytes, "application/zip"))],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["results"][0]["status"] == "error"
