"""Tests for the blocking generation routes and per-job progress.

``/generate`` and ``/compose-and-generate`` queue a delivery job and wait for
the queue to finish it; they never call the generation backend themselves.
These tests replace the queue with a recording one and play the worker's part
from the poll loop: the job moves on only when the route re-reads it.
"""

from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import backend_app
from backend.core.config import settings
from backend.core.dependencies import get_services
from backend.delivery.storage import REFERENCE_FORMAT
from backend.models import DeliveryJob
from backend.schemas import SDNextGenerationResult
from backend.services import ServiceRegistry, get_service_container_builder
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.queue import QueueBackend, QueueOrchestrator
from tests.util.delivery_jobs import set_job_status


class RecordingQueue(QueueBackend):
    """A durable queue that records jobs and runs nothing."""

    def __init__(self, *, fail: bool = False) -> None:
        self.job_ids: List[str] = []
        self.fail = fail

    def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
        if self.fail:
            raise ConnectionError("redis is down")
        self.job_ids.append(job_id)


class PollingWorker:
    """Finish a job once the waiting route has polled it ``finish_after`` times.

    Stands in for the RQ worker: it moves the job through the guarded
    transitions (``running``, then the final status) as a runner would.
    """

    def __init__(
        self,
        *,
        finish_after: Optional[int],
        status: str = "succeeded",
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.finish_after = finish_after
        self.status = status
        self.result = result
        self.polls = 0

    def on_poll(self, repository: DeliveryJobRepository, job_id: str) -> None:
        self.polls += 1
        if self.finish_after is None or self.polls != self.finish_after:
            return
        repository.transition_job_status(job_id, "running", from_statuses=("pending",))
        repository.transition_job_status(
            job_id, self.status, from_statuses=("running",), result=self.result
        )


class PolledRepository(DeliveryJobRepository):
    """Repository that lets the worker act whenever the route polls a job."""

    def __init__(self, session: Session, worker: Optional[PollingWorker]) -> None:
        super().__init__(session)
        self.worker = worker

    def get_job(self, job_id: str, *, refresh: bool = False) -> Optional[DeliveryJob]:
        if refresh and self.worker is not None:
            self.worker.on_poll(self, job_id)
        return super().get_job(job_id, refresh=refresh)


class LiveProgress:
    """Generation service stub whose SD.Next reports ``progress``."""

    def __init__(self, progress: float) -> None:
        self.progress = progress
        self.calls: List[tuple[str, str]] = []

    async def validate_generation_params(self, params) -> List[str]:
        return []

    async def check_generation_progress(
        self, job_id: str, backend_name: str = "sdnext"
    ) -> SDNextGenerationResult:
        self.calls.append((job_id, backend_name))
        return SDNextGenerationResult(
            job_id=job_id, status="running", progress=self.progress
        )


@pytest.fixture(autouse=True)
def fast_polling(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SDNEXT_POLL_INTERVAL", 0.001)
    monkeypatch.setattr(settings, "GENERATION_WAIT_TIMEOUT_SECONDS", 5)


@pytest.fixture
def use_services(db_session: Session):
    """Serve requests from a registry with a recording queue and a worker."""

    def _use(
        *,
        worker: Optional[PollingWorker] = None,
        queue: Optional[RecordingQueue] = None,
        generation: Any = None,
        compose: Any = None,
    ) -> SimpleNamespace:
        queue = queue or RecordingQueue()
        repository = PolledRepository(db_session, worker)
        builder = get_service_container_builder()
        if generation is not None:
            builder = builder.with_overrides(
                factories=lambda factories: replace(
                    factories, generation=lambda: generation
                )
            )
        services: ServiceRegistry = builder.build(
            db_session,
            queue_orchestrator=QueueOrchestrator(primary_backend=queue),
            delivery_repository=repository,
            analytics_repository=AnalyticsRepository(db_session),
            recommendation_gpu_available=False,
        )
        if compose is not None:
            # Registry services are cached properties; these replace them.
            services.compose = compose
            services.adapters = object()
        backend_app.dependency_overrides[get_services] = lambda: services
        return SimpleNamespace(queue=queue, services=services, repository=repository)

    yield _use
    backend_app.dependency_overrides.pop(get_services, None)


COMPLETED_RESULT = {
    "job_id": "sdnext-output",
    "status": "completed",
    "images": ["output://job_000.png"],
    "progress": 1.0,
    "generation_info": {"seed": 42},
}


# ---------------------------------------------------------------------------
# POST /generate
# ---------------------------------------------------------------------------


def test_generate_queues_a_job_and_returns_its_stored_result(
    client: TestClient, use_services
):
    worker = PollingWorker(finish_after=3, result=COMPLETED_RESULT)
    ctx = use_services(worker=worker)

    response = client.post(
        "/api/v1/generation/generate", json={"prompt": "test prompt", "steps": 5}
    )

    assert response.status_code == 200
    body = response.json()

    # One job was created and handed to the queue, never rendered in-request.
    assert len(ctx.queue.job_ids) == 1
    job_id = ctx.queue.job_ids[0]
    job = ctx.services.deliveries.get_job(job_id, refresh=True)
    assert job is not None
    assert job.status == "succeeded"
    assert job.mode == "sdnext"
    params = ctx.services.deliveries.get_job_params(job)
    assert params.generation_params["prompt"] == "test prompt"
    assert params.generation_params["steps"] == 5
    assert params.backend == "sdnext"
    assert params.mode == "immediate"
    assert params.save_images is True
    assert params.return_format == REFERENCE_FORMAT

    # The route waited for the worker rather than answering early.
    assert worker.polls >= 3

    assert body == {
        "job_id": job_id,
        "status": "completed",
        "images": [f"/api/v1/generation/results/{job_id}/images/0"],
        "progress": 1.0,
        "error_message": None,
        "generation_info": {"seed": 42},
    }


def test_generate_returns_a_failed_job_with_its_message(
    client: TestClient, use_services
):
    worker = PollingWorker(
        finish_after=1,
        status="failed",
        result={"status": "failed", "error_message": "SD.Next returned no images"},
    )
    ctx = use_services(worker=worker)

    response = client.post("/api/v1/generation/generate", json={"prompt": "p"})

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == ctx.queue.job_ids[0]
    assert body["status"] == "failed"
    assert body["error_message"] == "SD.Next returned no images"
    assert body["images"] is None


def test_generate_returns_a_cancelled_job_as_failed(client: TestClient, use_services):
    worker = PollingWorker(finish_after=2, status="cancelled")
    use_services(worker=worker)

    response = client.post("/api/v1/generation/generate", json={"prompt": "p"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["error_message"] == "Generation job was cancelled"


def test_generate_times_out_with_a_problem_naming_the_job(
    client: TestClient, use_services, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "GENERATION_WAIT_TIMEOUT_SECONDS", 0.05)
    worker = PollingWorker(finish_after=None)
    ctx = use_services(worker=worker)

    response = client.post("/api/v1/generation/generate", json={"prompt": "p"})

    assert response.status_code == 504
    job_id = ctx.queue.job_ids[0]
    body = response.json()
    assert body["status"] == 504
    assert body["title"] == "Generation still running"
    assert body["job_id"] == job_id
    assert body["job_url"] == f"/api/v1/generation/jobs/{job_id}"
    assert job_id in body["detail"]
    assert worker.polls >= 2

    # The job is untouched and can be followed.
    job = ctx.services.deliveries.get_job(job_id, refresh=True)
    assert job is not None and job.status == "pending"
    followed = client.get(body["job_url"])
    assert followed.status_code == 200
    assert followed.json()["delivery"]["id"] == job_id


def test_generate_answers_503_when_the_queue_rejects_the_job(
    client: TestClient, use_services, db_session: Session
):
    worker = PollingWorker(finish_after=1)
    use_services(worker=worker, queue=RecordingQueue(fail=True))

    response = client.post("/api/v1/generation/generate", json={"prompt": "p"})

    assert response.status_code == 503
    assert response.json()["title"] == "Job queue unavailable"
    # The job was failed rather than left pending, and nobody waited for it.
    jobs = DeliveryJobRepository(db_session).list_jobs()
    assert [job.status for job in jobs] == ["failed"]
    assert worker.polls == 0


def test_blocking_routes_no_longer_take_result_format_options(client: TestClient):
    paths = client.get("/api/openapi.json").json()["paths"]
    for path in ("/v1/generation/generate", "/v1/generation/compose-and-generate"):
        names = {param["name"] for param in paths[path]["post"].get("parameters", [])}
        assert names == {"backend"}, path
        assert "504" in paths[path]["post"]["responses"]


# ---------------------------------------------------------------------------
# POST /compose-and-generate
# ---------------------------------------------------------------------------


def _compose_stub(prompt: str, tokens: List[str]) -> SimpleNamespace:
    composition = SimpleNamespace(prompt=prompt, tokens=tokens, warnings=["warn"])
    calls: List[Dict[str, str]] = []

    def compose_from_adapter_service(adapters, prefix="", suffix=""):
        calls.append({"prefix": prefix, "suffix": suffix})
        return composition

    return SimpleNamespace(
        compose_from_adapter_service=compose_from_adapter_service, calls=calls
    )


def test_compose_and_generate_queues_the_composed_prompt(
    client: TestClient, use_services
):
    compose = _compose_stub("hi <lora:test:1.0> there", ["<lora:test:1.0>"])
    worker = PollingWorker(finish_after=2, result=COMPLETED_RESULT)
    ctx = use_services(worker=worker, compose=compose)

    response = client.post(
        "/api/v1/generation/compose-and-generate",
        json={
            "compose_request": {"prefix": "hi", "suffix": "there"},
            "generation_params": {"prompt": "placeholder", "steps": 1},
        },
    )

    assert response.status_code == 200
    assert compose.calls == [{"prefix": "hi", "suffix": "there"}]
    job_id = ctx.queue.job_ids[0]
    job = ctx.services.deliveries.get_job(job_id)
    assert job is not None
    assert job.prompt == "hi <lora:test:1.0> there"
    params = ctx.services.deliveries.get_job_params(job)
    assert params.generation_params["prompt"] == "hi <lora:test:1.0> there"
    assert params.mode == "immediate"

    body = response.json()
    assert body["job_id"] == job_id
    assert body["status"] == "completed"
    assert body["images"] == [f"/api/v1/generation/results/{job_id}/images/0"]


def test_compose_and_generate_without_active_adapters_queues_nothing(
    client: TestClient, use_services
):
    ctx = use_services(compose=_compose_stub("", []))

    response = client.post(
        "/api/v1/generation/compose-and-generate",
        json={
            "compose_request": {"prefix": "hi"},
            "generation_params": {"prompt": "", "steps": 1},
        },
    )

    assert response.status_code == 400
    assert response.json()["title"] == "No active adapters found"
    assert ctx.queue.job_ids == []


# ---------------------------------------------------------------------------
# GET /progress/{job_id}
# ---------------------------------------------------------------------------


def _create_job(ctx: SimpleNamespace, prompt: str = "p") -> str:
    job = ctx.services.deliveries.create_job(
        prompt,
        "sdnext",
        {"generation_params": {"prompt": prompt}, "backend": "sdnext"},
    )
    return job.id


def test_progress_of_unknown_job_is_404(client: TestClient, use_services):
    use_services()

    response = client.get("/api/v1/generation/progress/missing")

    assert response.status_code == 404


def test_progress_reports_a_queued_job_from_its_row(client: TestClient, use_services):
    live = LiveProgress(0.7)
    ctx = use_services(generation=live)
    job_id = _create_job(ctx)

    body = client.get(f"/api/v1/generation/progress/{job_id}").json()

    assert body["job_id"] == job_id
    assert body["status"] == "queued"
    assert body["progress"] == 0.0
    # SD.Next's global progress belongs to whatever it renders, not this job.
    assert live.calls == []


def test_progress_uses_live_progress_only_for_the_rendering_job(
    client: TestClient, use_services
):
    live = LiveProgress(0.7)
    ctx = use_services(generation=live)
    older = _create_job(ctx, "older")
    set_job_status(ctx.services.deliveries, older, "running")
    rendering = _create_job(ctx, "rendering")
    set_job_status(ctx.services.deliveries, rendering, "running")

    rendering_body = client.get(f"/api/v1/generation/progress/{rendering}").json()
    older_body = client.get(f"/api/v1/generation/progress/{older}").json()

    assert rendering_body["status"] == "processing"
    assert rendering_body["progress"] == pytest.approx(0.7)
    assert older_body["status"] == "processing"
    assert older_body["progress"] == 0.0
    assert live.calls == [(rendering, "sdnext")]


def test_progress_prefers_stored_progress(client: TestClient, use_services):
    live = LiveProgress(0.7)
    ctx = use_services(generation=live)
    job_id = _create_job(ctx)
    set_job_status(ctx.services.deliveries, job_id, "running", {"progress": 50})

    body = client.get(f"/api/v1/generation/progress/{job_id}").json()

    assert body["progress"] == pytest.approx(0.5)  # legacy stored percentage
    assert live.calls == []


def test_progress_of_a_completed_job_is_one_with_image_urls(
    client: TestClient, use_services
):
    ctx = use_services()
    job_id = _create_job(ctx)
    set_job_status(ctx.services.deliveries, job_id, "running")
    set_job_status(
        ctx.services.deliveries,
        job_id,
        "succeeded",
        {**COMPLETED_RESULT, "progress": None},
    )

    body = client.get(f"/api/v1/generation/progress/{job_id}").json()

    assert body["status"] == "completed"
    assert body["progress"] == 1.0
    assert body["images"] == [f"/api/v1/generation/results/{job_id}/images/0"]
