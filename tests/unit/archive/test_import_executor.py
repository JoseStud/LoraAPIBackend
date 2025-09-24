import io
import json
import zipfile
from pathlib import Path

import pytest
from sqlmodel import select

from backend.models import Adapter
from backend.services.adapters import AdapterService
from backend.services.archive import ArchiveImportExecutor
from backend.services.storage import LocalFileSystemStorage, StorageService


def _build_executor(db_session):
    storage = StorageService(LocalFileSystemStorage())
    adapter_service = AdapterService(db_session, storage.backend)
    executor = ArchiveImportExecutor(adapter_service)
    return executor, adapter_service, storage


def test_execute_persists_adapter(tmp_path, db_session):
    buffer = io.BytesIO()
    weights = tmp_path / "executor.safetensors"
    weights.write_bytes(b"payload" * 4)

    manifest = {
        "adapters": [
            {
                "id": "executor",
                "metadata_path": "adapters/executor/metadata.json",
                "files": [
                    {
                        "kind": "primary",
                        "original_path": str(weights),
                        "original_name": weights.name,
                        "exists": True,
                        "size": weights.stat().st_size,
                        "archive_path": (
                            "adapters/executor/files/0_executor.safetensors"
                        ),
                    },
                ],
            },
        ],
    }
    metadata = {
        "name": "executor",
        "file_path": str(weights),
    }

    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("adapters/executor/metadata.json", json.dumps(metadata))
        archive.writestr(
            "adapters/executor/files/0_executor.safetensors", weights.read_bytes()
        )
    buffer.seek(0)

    executor, adapter_service, _ = _build_executor(db_session)

    result = executor.execute(buffer, target_directory=tmp_path)

    assert result.created == 1
    stored = db_session.exec(select(Adapter).where(Adapter.name == "executor")).first()
    assert stored is not None
    assert Path(stored.file_path).exists()


def test_execute_validates_missing_files(tmp_path, db_session):
    buffer = io.BytesIO()
    weights = tmp_path / "missing.safetensors"
    weights.write_bytes(b"content")

    manifest = {
        "adapters": [
            {
                "id": "missing",
                "metadata_path": "adapters/missing/metadata.json",
                "files": [
                    {
                        "kind": "primary",
                        "original_path": str(weights),
                        "original_name": weights.name,
                        "exists": True,
                        "size": weights.stat().st_size,
                        "archive_path": "adapters/missing/files/0_missing.safetensors",
                    },
                ],
            },
        ],
    }
    metadata = {
        "name": "missing",
        "file_path": str(weights),
    }

    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("adapters/missing/metadata.json", json.dumps(metadata))
    buffer.seek(0)

    executor, *_ = _build_executor(db_session)

    with pytest.raises(ValueError):
        executor.execute(buffer, target_directory=tmp_path, validate=True)
