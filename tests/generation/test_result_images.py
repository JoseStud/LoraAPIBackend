"""Result images are stored as file references and served by a keyless route."""

from __future__ import annotations

import asyncio
import base64
import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.core.config import settings
from backend.delivery.base import DeliveryRegistry
from backend.delivery.sdnext import SDNextGenerationBackend
from backend.delivery.sdnext_client import SDNextResponse
from backend.delivery.storage import (
    REFERENCE_FORMAT,
    FileSystemImageStorage,
    stored_return_format,
)
from backend.schemas import SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.storage import StorageService, get_storage_backend
from backend.services.websocket.job_monitor import (
    JobProgressMonitor,
    PersistedJobState,
)
from backend.utils.images import (
    make_output_reference,
    parse_output_reference,
    to_browser_image_src,
)
from backend.workers.delivery_runner import DeliveryRunner
from tests.test_sdnext_backend import FakeSDNextSession

PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQAB"
    "DQottAAAAABJRU5ErkJggg=="
)
PNG_BYTES = base64.b64decode(PNG_BASE64)


@pytest.fixture
def output_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point SDNEXT_OUTPUT_DIR at a temporary directory."""
    directory = tmp_path / "outputs"
    directory.mkdir()
    monkeypatch.setattr(settings, "SDNEXT_OUTPUT_DIR", str(directory))
    return directory


@pytest.fixture
def deliveries(db_session: Session) -> DeliveryService:
    """A delivery service on the test database, with real file storage."""
    return DeliveryService(DeliveryJobRepository(db_session))


def _store_job(
    deliveries: DeliveryService,
    images: List[str],
    *,
    return_format: str = "base64",
) -> str:
    job = deliveries.create_job(
        "prompt",
        "sdnext",
        {"generation_params": {"prompt": "prompt"}, "return_format": return_format},
    )
    deliveries.update_job_status(
        job.id, "succeeded", {"status": "completed", "images": images}
    )
    return job.id


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("save_images", "return_format", "expected"),
    [
        (True, "base64", REFERENCE_FORMAT),
        (True, "file_path", REFERENCE_FORMAT),
        (True, "url", REFERENCE_FORMAT),
        (False, "file_path", REFERENCE_FORMAT),
        (False, "url", REFERENCE_FORMAT),
        (False, "base64", "base64"),
    ],
)
def test_stored_return_format(save_images, return_format, expected):
    """Anything written to disk is stored by reference; unsaved base64 is kept."""
    assert (
        stored_return_format(save_images=save_images, return_format=return_format)
        == expected
    )


@pytest.mark.anyio
async def test_storage_returns_output_reference(tmp_path: Path):
    storage = FileSystemImageStorage(str(tmp_path))

    (reference,) = await storage.persist_images(
        [PNG_BASE64], "job", save_images=True, return_format=REFERENCE_FORMAT
    )

    relative = parse_output_reference(reference)
    assert relative is not None and "/" not in relative
    assert (tmp_path / relative).read_bytes() == PNG_BYTES


@pytest.mark.anyio
async def test_storage_keeps_live_base64_response(tmp_path: Path):
    """``return_format`` still shapes the immediate response."""
    storage = FileSystemImageStorage(str(tmp_path))

    images = await storage.persist_images(
        [PNG_BASE64], "job", save_images=True, return_format="base64"
    )

    assert images == [PNG_BASE64]
    assert len(list(tmp_path.iterdir())) == 1


# ---------------------------------------------------------------------------
# Deferred job: what ends up in the database
# ---------------------------------------------------------------------------


def _run_deferred_job(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    output_dir: Path,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    deliveries = DeliveryService(DeliveryJobRepository(db_session))
    job = deliveries.create_job("prompt", "sdnext", params)

    session = FakeSDNextSession(
        submit_response=SDNextResponse(
            ok=True,
            status=200,
            data={"images": [PNG_BASE64, PNG_BASE64], "info": {"seed": 1}},
        )
    )
    backend = SDNextGenerationBackend(
        session=session, storage=FileSystemImageStorage(str(output_dir))
    )
    registry = DeliveryRegistry()
    registry.register_generation_backend("sdnext", backend)

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(
        "backend.workers.delivery_runner.get_session_context", session_context
    )
    DeliveryRunner(
        registry, delivery_service_factory=lambda _session: deliveries
    ).process_delivery_job(job.id)

    db_session.expire_all()
    stored = deliveries.get_job(job.id)
    assert stored is not None and stored.status == "succeeded"
    assert isinstance(stored.result, str)
    return {"raw": stored.result, "result": json.loads(stored.result)}


def test_default_deferred_job_stores_references_not_base64(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    output_dir: Path,
):
    """The Studio defaults (base64, save_images) leave no image data in the row."""
    stored = _run_deferred_job(
        db_session,
        monkeypatch,
        output_dir,
        {"generation_params": {"prompt": "prompt"}},
    )

    assert PNG_BASE64 not in stored["raw"]
    images = stored["result"]["images"]
    assert len(images) == 2
    for image in images:
        relative = parse_output_reference(image)
        assert relative is not None
        assert (output_dir / relative).read_bytes() == PNG_BYTES


def test_unsaved_base64_job_still_stores_base64(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    output_dir: Path,
):
    """``save_images=False`` with base64 is an explicit request for the data."""
    stored = _run_deferred_job(
        db_session,
        monkeypatch,
        output_dir,
        {
            "generation_params": {"prompt": "prompt"},
            "save_images": False,
            "return_format": "base64",
        },
    )

    assert stored["result"]["images"] == [PNG_BASE64, PNG_BASE64]
    assert list(output_dir.iterdir()) == []


# ---------------------------------------------------------------------------
# Browser sources
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "index", "expected"),
    [
        (
            make_output_reference("a.png"),
            2,
            "/api/v1/generation/results/job-1/images/2",
        ),
        ("file:///app/outputs/a.png", 0, "/api/v1/generation/results/job-1/images/0"),
        (make_output_reference("a.png"), None, None),
        (PNG_BASE64, 0, f"data:image/png;base64,{PNG_BASE64}"),
        ("data:image/png;base64,AAAA", 0, "data:image/png;base64,AAAA"),
        ("https://example.test/a.png", 0, "https://example.test/a.png"),
        ("/app/outputs/a.png", 0, None),
        ("", 0, None),
    ],
)
def test_to_browser_image_src(value: str, index: Optional[int], expected):
    assert to_browser_image_src(value, job_id="job-1", index=index) == expected


def test_results_list_emits_route_url_and_legacy_data_uri(
    client: TestClient,
    deliveries: DeliveryService,
):
    reference_job = _store_job(deliveries, [make_output_reference("a.png")])
    legacy_job = _store_job(deliveries, [PNG_BASE64])

    response = client.get("/api/v1/generation/results")

    assert response.status_code == 200
    urls = {item["id"]: item["image_url"] for item in response.json()}
    assert urls[reference_job] == (
        f"/api/v1/generation/results/{reference_job}/images/0"
    )
    assert urls[legacy_job] == f"data:image/png;base64,{PNG_BASE64}"


@pytest.mark.anyio
async def test_completion_message_points_at_image_route():
    persisted = PersistedJobState(
        status="succeeded",
        result={"status": "completed", "images": [make_output_reference("a.png")]},
        started_at=None,
        finished_at=None,
    )

    class Repository:
        def get_job_state(self, job_id: str) -> PersistedJobState:
            return persisted

    class Idle:
        async def check_progress(self, job_id: str) -> SDNextGenerationResult:
            return SDNextGenerationResult(job_id=job_id, status="pending")

    monitor = JobProgressMonitor(repository=Repository(), poll_interval=0.0)
    completions = []

    async def on_progress(update) -> None:
        return None

    async def on_complete(message) -> None:
        completions.append(message)

    task = await monitor.start("job-9", Idle(), on_progress, on_complete)
    await asyncio.wait_for(task, timeout=1.0)

    assert completions[0].images == ["/api/v1/generation/results/job-9/images/0"]


# ---------------------------------------------------------------------------
# Image route
# ---------------------------------------------------------------------------


@pytest.fixture
def api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "API_KEY", "secret-key")
    return "secret-key"


def test_route_serves_file_without_api_key(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
    api_key: str,
):
    (output_dir / "job_000.png").write_bytes(PNG_BYTES)
    job_id = _store_job(deliveries, [make_output_reference("job_000.png")])

    response = client.get(f"/api/v1/generation/results/{job_id}/images/0")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == PNG_BYTES
    # The rest of the generation API still checks the key.
    assert client.get("/api/v1/generation/results").status_code == 403


def test_route_serves_legacy_file_path_inside_output_dir(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
):
    path = output_dir / "legacy.png"
    path.write_bytes(PNG_BYTES)
    job_id = _store_job(deliveries, [str(path)], return_format="file_path")

    response = client.get(f"/api/v1/generation/results/{job_id}/images/0")

    assert response.status_code == 200
    assert response.content == PNG_BYTES


@pytest.mark.parametrize("index", [1, -1])
def test_route_404s_for_bad_index(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
    index: int,
):
    (output_dir / "job_000.png").write_bytes(PNG_BYTES)
    job_id = _store_job(deliveries, [make_output_reference("job_000.png")])

    response = client.get(f"/api/v1/generation/results/{job_id}/images/{index}")

    assert response.status_code == 404


def test_route_404s_for_missing_file_job_or_base64_row(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
):
    missing = _store_job(deliveries, [make_output_reference("gone.png")])
    legacy = _store_job(deliveries, [PNG_BASE64])

    for job_id in (missing, legacy, "no-such-job"):
        response = client.get(f"/api/v1/generation/results/{job_id}/images/0")
        assert response.status_code == 404, job_id


def test_route_refuses_paths_outside_output_dir(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
    tmp_path: Path,
):
    """Crafted rows cannot read files outside the output directory."""
    secret = tmp_path / "secret.png"
    secret.write_bytes(PNG_BYTES)
    (output_dir / "link.png").symlink_to(secret)

    crafted = [
        _store_job(deliveries, [make_output_reference("../secret.png")]),
        _store_job(deliveries, [make_output_reference(str(secret))]),
        _store_job(deliveries, [make_output_reference("link.png")]),
        _store_job(deliveries, [f"file://{secret}"]),
        _store_job(deliveries, [str(secret)], return_format="file_path"),
    ]

    for job_id in crafted:
        response = client.get(f"/api/v1/generation/results/{job_id}/images/0")
        assert response.status_code == 404, job_id


def test_validate_file_path_enforces_root(tmp_path: Path):
    root = tmp_path / "root"
    root.mkdir()
    inside = root / "a.png"
    inside.write_bytes(PNG_BYTES)
    outside = tmp_path / "b.png"
    outside.write_bytes(PNG_BYTES)
    (root / "link.png").symlink_to(outside)

    storage = StorageService(get_storage_backend())

    assert storage.validate_file_path(str(inside), root=root)
    assert storage.validate_file_path(str(outside))
    assert not storage.validate_file_path(str(outside), root=root)
    assert not storage.validate_file_path(str(root / ".." / "b.png"), root=root)
    assert not storage.validate_file_path(str(root / "link.png"), root=root)


def test_download_and_delete_follow_references(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
):
    """The keyed download and delete endpoints resolve references too."""
    path = output_dir / "job_000.png"
    path.write_bytes(PNG_BYTES)
    job_id = _store_job(deliveries, [make_output_reference("job_000.png")])

    download = client.get(f"/api/v1/generation/results/{job_id}/download")
    assert download.status_code == 200
    assert download.content == PNG_BYTES

    assert client.delete(f"/api/v1/generation/results/{job_id}").status_code == 204
    assert not path.exists()


def test_job_status_exposes_browser_sources_not_references(
    client: TestClient,
    deliveries: DeliveryService,
    output_dir: Path,
):
    """Job status responses never leak ``output://`` references."""
    reference_job = _store_job(
        deliveries,
        [make_output_reference("a.png"), make_output_reference("b.png")],
    )
    legacy_job = _store_job(deliveries, [PNG_BASE64, "/app/outputs/raw.png"])

    response = client.get(f"/api/v1/generation/jobs/{reference_job}")
    assert response.status_code == 200
    assert "output://" not in response.text
    assert response.json()["delivery"]["result"]["images"] == [
        f"/api/v1/generation/results/{reference_job}/images/0",
        f"/api/v1/generation/results/{reference_job}/images/1",
    ]

    response = client.get(f"/api/v1/generation/jobs/{legacy_job}")
    assert response.status_code == 200
    # Unloadable entries (a bare server path) are dropped, not leaked.
    assert response.json()["delivery"]["result"]["images"] == [
        f"data:image/png;base64,{PNG_BASE64}"
    ]

    stored = deliveries.get_job(reference_job)
    assert stored is not None and "output://" in stored.result
