"""Unit tests for the archive helper service."""

import io
import json
import zipfile
from pathlib import Path

import pytest
from sqlmodel import select

from backend.models import Adapter
from backend.services.adapters import AdapterService
from backend.services.archive import ArchiveService
from backend.services.storage import LocalFileSystemStorage, StorageService


def _build_services(db_session):
    storage = StorageService(LocalFileSystemStorage())
    adapter_service = AdapterService(db_session, storage.backend)
    return adapter_service, storage


def test_export_archive_contains_manifest_and_files(tmp_path, db_session):
    weights = tmp_path / "test.safetensors"
    weights.write_bytes(b"x" * 1024)
    metadata = tmp_path / "test.json"
    metadata.write_text("{}", encoding="utf-8")

    adapter = Adapter(
        name="demo",
        version="1.0",
        file_path=str(weights),
        primary_file_local_path=str(weights),
        json_file_path=str(metadata),
    )
    db_session.add(adapter)
    db_session.commit()
    db_session.refresh(adapter)

    adapter_service, storage = _build_services(db_session)
    archive_service = ArchiveService(adapter_service, storage)

    archive = archive_service.build_export_archive()
    data = b"".join(archive.iterator)

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest["adapter_count"] == 1
        metadata_path = manifest["adapters"][0]["metadata_path"]
        metadata_payload = json.loads(zf.read(metadata_path).decode("utf-8"))
        assert metadata_payload["name"] == "demo"
        file_entry = manifest["adapters"][0]["files"][0]
        assert file_entry["exists"] is True
        assert file_entry["size"] == weights.stat().st_size
        assert file_entry["archive_path"] in zf.namelist()

    assert archive.size == len(data)


def test_import_archive_roundtrip(tmp_path, db_session):
    weights = tmp_path / "roundtrip.safetensors"
    weights.write_bytes(b"y" * 2048)

    adapter = Adapter(
        name="roundtrip",
        version="1",
        file_path=str(weights),
        primary_file_local_path=str(weights),
    )
    db_session.add(adapter)
    db_session.commit()
    db_session.refresh(adapter)

    adapter_service, storage = _build_services(db_session)
    archive_service = ArchiveService(adapter_service, storage)

    archive = archive_service.build_export_archive()
    archive_bytes = b"".join(archive.iterator)

    db_session.delete(adapter)
    db_session.commit()

    target_dir = tmp_path / "imported"
    summary = archive_service.import_archive(io.BytesIO(archive_bytes), target_directory=target_dir)

    assert summary.created == 1
    stored = db_session.exec(select(Adapter).where(Adapter.name == "roundtrip")).first()
    assert stored is not None
    assert Path(stored.file_path).exists()


def test_import_archive_missing_manifest_raises(tmp_path, db_session):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("adapters/dummy.txt", "noop")
    buffer.seek(0)

    adapter_service, storage = _build_services(db_session)
    archive_service = ArchiveService(adapter_service, storage)

    with pytest.raises(ValueError):
        archive_service.import_archive(buffer, target_directory=tmp_path)


def test_estimate_export_matches_total_bytes(tmp_path, db_session):
    weights = tmp_path / "estimate.safetensors"
    weights.write_bytes(b"z" * 5120)

    adapter = Adapter(
        name="estimate",
        version="1",
        file_path=str(weights),
        primary_file_local_path=str(weights),
    )
    db_session.add(adapter)
    db_session.commit()

    adapter_service, storage = _build_services(db_session)
    archive_service = ArchiveService(adapter_service, storage)

    estimation = archive_service.estimate_adapter_export()
    assert estimation.adapters == 1

    archive = archive_service.build_export_archive()
    archive_bytes = b"".join(archive.iterator)

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
        manifest_bytes = len(zf.read("manifest.json"))
        metadata_bytes = sum(
            len(zf.read(name))
            for name in zf.namelist()
            if name.endswith("metadata.json") and name != "manifest.json"
        )
        file_bytes = sum(
            len(zf.read(name))
            for name in zf.namelist()
            if "/files/" in name
        )

    expected_total = manifest_bytes + metadata_bytes + file_bytes
    assert estimation.total_bytes == expected_total
    assert estimation.estimated_seconds > 0
