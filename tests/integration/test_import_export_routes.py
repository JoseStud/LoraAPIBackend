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


def test_export_estimate_endpoint_reflects_current_data(
    client, db_session, tmp_path, dist_dir
):


def test_import_endpoint_creates_adapter(
    client, db_session, tmp_path, monkeypatch, dist_dir
):


def test_import_endpoint_rejects_invalid_archive(
    client, db_session, tmp_path, monkeypatch, dist_dir
):


@pytest.fixture
def dist_dir(tmp_path: Path) -> Path:
    """Create a temporary dist directory for export tests."""
    dist = tmp_path / "dist"
    dist.mkdir(parents=True, exist_ok=True)
    return dist
