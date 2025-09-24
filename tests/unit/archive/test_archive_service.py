import io
import json
import zipfile

from backend.services.archive import (
    ArchiveService,
    ExportEstimation,
    ExportPlan,
    ImportResult,
    MetadataEntry,
    PlannedFile,
)


class RecordingPlanner:
    def __init__(self, plan: ExportPlan, estimation: ExportEstimation) -> None:
        self.plan = plan
        self.estimation = estimation
        self.build_called_with = None
        self.estimate_called_with = None

    def build_plan(self, adapter_ids=None):
        self.build_called_with = adapter_ids
        return self.plan

    def estimate(self, adapter_ids=None):
        self.estimate_called_with = adapter_ids
        return self.estimation


class RecordingExecutor:
    def __init__(self, result: ImportResult) -> None:
        self.result = result
        self.called_with = None

    def execute(self, file_obj, *, target_directory=None, persist=True, validate=True):
        self.called_with = {
            "file_obj": file_obj,
            "target_directory": target_directory,
            "persist": persist,
            "validate": validate,
        }
        return self.result


def _build_plan(tmp_path):
    weights = tmp_path / "service.bin"
    weights.write_bytes(b"binary" * 2)
    metadata_entry = MetadataEntry(
        archive_path="adapters/demo/metadata.json",
        payload=json.dumps({"name": "demo", "file_path": str(weights)}).encode("utf-8"),
    )
    file_entry = PlannedFile(
        archive_path="adapters/demo/files/0_service.bin",
        source_path=str(weights),
        size=weights.stat().st_size,
        kind="primary",
        original_name=weights.name,
    )
    manifest = {
        "adapters": [
            {
                "id": "demo",
                "metadata_path": metadata_entry.archive_path,
                "files": [
                    {
                        "kind": file_entry.kind,
                        "original_path": file_entry.source_path,
                        "original_name": file_entry.original_name,
                        "exists": True,
                        "size": file_entry.size,
                        "archive_path": file_entry.archive_path,
                    },
                ],
            },
        ],
        "adapter_count": 1,
        "file_total_bytes": file_entry.size,
        "metadata_total_bytes": len(metadata_entry.payload),
        "total_bytes": file_entry.size + len(metadata_entry.payload),
    }
    manifest_bytes = json.dumps(manifest).encode("utf-8")
    metadata_total = len(metadata_entry.payload) + len(manifest_bytes)
    total_bytes = metadata_total + file_entry.size
    manifest["metadata_total_bytes"] = metadata_total
    manifest["total_bytes"] = total_bytes
    plan = ExportPlan(
        manifest=manifest,
        manifest_bytes=manifest_bytes,
        metadata_entries=[metadata_entry],
        file_entries=[file_entry],
        file_total_bytes=file_entry.size,
        metadata_total_bytes=metadata_total,
        total_bytes=total_bytes,
    )
    estimation = ExportEstimation(
        adapters=1,
        total_bytes=total_bytes,
        metadata_bytes=metadata_total,
        file_bytes=file_entry.size,
        estimated_seconds=1.0,
    )
    return plan, estimation, weights


def test_archive_service_streams_planned_archive(tmp_path):
    plan, estimation, weights = _build_plan(tmp_path)
    planner = RecordingPlanner(plan, estimation)
    executor = RecordingExecutor(
        ImportResult(manifest={}, created=0, updated=0, adapters=[]),
    )
    service = ArchiveService(
        adapter_service=None,  # type: ignore[arg-type]
        storage_service=None,  # type: ignore[arg-type]
        planner=planner,
        executor=executor,  # type: ignore[arg-type]
    )

    archive = service.build_export_archive(adapter_ids=["demo"])
    payload = b"".join(archive.iterator)

    assert planner.build_called_with == ["demo"]
    assert archive.manifest["adapter_count"] == 1
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        assert "manifest.json" in zf.namelist()
        assert (
            zf.read(plan.metadata_entries[0].archive_path)
            == plan.metadata_entries[0].payload
        )
        assert zf.read(plan.file_entries[0].archive_path) == weights.read_bytes()


def test_archive_service_estimate_uses_planner(tmp_path):
    plan, estimation, _ = _build_plan(tmp_path)
    planner = RecordingPlanner(plan, estimation)
    executor = RecordingExecutor(
        ImportResult(manifest={}, created=0, updated=0, adapters=[]),
    )
    service = ArchiveService(  # type: ignore[arg-type]
        adapter_service=None,
        storage_service=None,
        planner=planner,
        executor=executor,  # type: ignore[arg-type]
    )

    result = service.estimate_adapter_export(adapter_ids=["demo"])

    assert planner.estimate_called_with == ["demo"]
    assert result is estimation


def test_archive_service_import_delegates_to_executor(tmp_path):
    plan, estimation, _ = _build_plan(tmp_path)
    planner = RecordingPlanner(plan, estimation)
    import_result = ImportResult(manifest={}, created=1, updated=0, adapters=[])
    executor = RecordingExecutor(import_result)
    service = ArchiveService(  # type: ignore[arg-type]
        adapter_service=None,
        storage_service=None,
        planner=planner,
        executor=executor,  # type: ignore[arg-type]
    )

    fake_file = io.BytesIO(b"data")
    result = service.import_archive(fake_file, target_directory=tmp_path, persist=False)

    assert executor.called_with["target_directory"] == tmp_path
    assert executor.called_with["persist"] is False
    assert result is import_result
