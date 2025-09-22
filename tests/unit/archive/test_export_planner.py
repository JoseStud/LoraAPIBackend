import json
from pathlib import Path

from backend.models import Adapter
from backend.services.adapters import AdapterService
from backend.services.archive import ArchiveExportPlanner
from backend.services.storage import LocalFileSystemStorage, StorageService


def _build_planner(db_session):
    storage = StorageService(LocalFileSystemStorage())
    adapter_service = AdapterService(db_session, storage.backend)
    planner = ArchiveExportPlanner(adapter_service, storage)
    return planner, adapter_service, storage


def test_build_plan_includes_existing_files(tmp_path, db_session):
    weights = tmp_path / "planner.safetensors"
    weights.write_bytes(b"data" * 16)
    metadata = tmp_path / "planner.json"
    metadata.write_text(json.dumps({"foo": "bar"}), encoding="utf-8")

    adapter = Adapter(
        name="planner",
        version="1.0",
        file_path=str(weights),
        primary_file_local_path=str(weights),
        json_file_path=str(metadata),
    )
    db_session.add(adapter)
    db_session.commit()
    db_session.refresh(adapter)

    planner, _, _ = _build_planner(db_session)

    plan = planner.build_plan()

    assert plan.manifest["adapter_count"] == 1
    assert plan.manifest["file_total_bytes"] == sum(entry.size for entry in plan.file_entries)
    paths = {entry.archive_path: entry.source_path for entry in plan.file_entries}
    weight_entry = next(entry for entry in plan.file_entries if entry.source_path == str(weights.resolve()))
    assert Path(paths[weight_entry.archive_path]).resolve() == weights.resolve()
    assert plan.metadata_entries[0].archive_path.endswith("metadata.json")
    assert json.loads(plan.metadata_entries[0].payload.decode("utf-8"))["name"] == "planner"


def test_estimate_reflects_plan_totals(tmp_path, db_session):
    weights = tmp_path / "estimate_planner.safetensors"
    weights.write_bytes(b"abc" * 1024)

    adapter = Adapter(
        name="estimate",
        version="1",
        file_path=str(weights),
        primary_file_local_path=str(weights),
    )
    db_session.add(adapter)
    db_session.commit()

    planner, _, _ = _build_planner(db_session)

    plan = planner.build_plan()
    estimate = planner.estimate()

    assert estimate.adapters == 1
    assert estimate.file_bytes == plan.file_total_bytes
    assert estimate.metadata_bytes == plan.metadata_total_bytes
    assert estimate.total_bytes == plan.total_bytes
    assert estimate.estimated_seconds > 0
