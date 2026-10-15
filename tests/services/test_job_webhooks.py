"""Tests for the finished-job webhook and its wiring into the delivery runner."""

from contextlib import contextmanager
from typing import Any, Dict, List

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from backend.core.config import settings
from backend.delivery.base import DeliveryRegistry, GenerationBackend
from backend.schemas import SDNextGenerationParams, SDNextGenerationResult
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.job_webhooks import JobWebhookNotifier
from backend.services.queue import QueueBackend, QueueOrchestrator
from backend.services.websocket import WebSocketService
from backend.workers.delivery_runner import DeliveryRunner


def test_payload_for_success_points_at_download_and_omits_images():
    """Successful jobs expose a download path, never the base64 image data."""
    payload = JobWebhookNotifier.build_payload(
        "job-1",
        "succeeded",
        "a castle <lora:foo:0.800>",
        {
            "backend": "sdnext",
            "client_ref": "n8n-form",
            "generation_params": {"prompt": "a castle", "steps": 20},
        },
        {"status": "completed", "images": ["aGVsbG8=", "d29ybGQ="]},
    )

    assert payload["event"] == "generation.finished"
    assert payload["status"] == "succeeded"
    assert payload["client_ref"] == "n8n-form"
    assert payload["image_count"] == 2
    assert payload["download_path"] == "/api/v1/generation/results/job-1/download"
    assert payload["generation_params"] == {"prompt": "a castle", "steps": 20}
    assert payload["error"] is None
    assert "aGVsbG8=" not in str(payload)


def test_payload_for_failure_truncates_error_and_has_no_download():
    """Failed jobs carry a bounded error message and no download path."""
    payload = JobWebhookNotifier.build_payload(
        "job-2",
        "failed",
        "prompt",
        {},
        {"status": "failed", "error_message": "x" * 2000},
    )

    assert payload["download_path"] is None
    assert payload["client_ref"] is None
    assert len(payload["error"]) == 500


def test_from_settings_is_disabled_without_url(monkeypatch: pytest.MonkeyPatch):
    """No URL means no notifier, so the runner skips the webhook entirely."""
    monkeypatch.setattr(settings, "JOB_WEBHOOK_URL", None)
    assert JobWebhookNotifier.from_settings() is None

    monkeypatch.setattr(settings, "JOB_WEBHOOK_URL", "  ")
    assert JobWebhookNotifier.from_settings() is None

    monkeypatch.setattr(settings, "JOB_WEBHOOK_URL", "http://n8n.local/webhook/x")
    assert JobWebhookNotifier.from_settings() is not None


@pytest.mark.anyio
async def test_send_posts_json_with_token_header():
    """The webhook body is JSON and the shared token travels in its header."""
    received: List[Dict[str, Any]] = []

    async def handler(request: web.Request) -> web.Response:
        received.append({
            "body": await request.json(),
            "token": request.headers.get("X-Test-Token"),
            "event": request.headers.get("X-LoRA-Manager-Event"),
        })
        return web.json_response({"ok": True})

    app = web.Application()
    app.router.add_post("/hook", handler)
    async with TestServer(app) as server:
        notifier = JobWebhookNotifier(
            str(server.make_url("/hook")),
            token="s3cret",
            token_header="X-Test-Token",
        )
        assert await notifier.send({"job_id": "job-3", "status": "succeeded"})

    assert received == [
        {
            "body": {"job_id": "job-3", "status": "succeeded"},
            "token": "s3cret",
            "event": "generation.finished",
        }
    ]


@pytest.mark.anyio
async def test_send_reports_http_errors_without_raising():
    """A rejecting receiver is logged and reported as ``False``."""

    async def handler(request: web.Request) -> web.Response:
        return web.Response(status=403)

    app = web.Application()
    app.router.add_post("/hook", handler)
    async with TestServer(app) as server:
        notifier = JobWebhookNotifier(str(server.make_url("/hook")))
        assert await notifier.send({"job_id": "job-4"}) is False


@pytest.mark.anyio
async def test_send_swallows_connection_errors():
    """An unreachable receiver never propagates an exception into the job."""
    notifier = JobWebhookNotifier("http://127.0.0.1:9/hook", timeout=1)
    assert await notifier.send({"job_id": "job-5"}) is False


class _SilentQueue(QueueBackend):
    def enqueue_delivery(self, job_id, *, background_tasks=None, **enqueue_kwargs):
        return job_id


class _StaticBackend(GenerationBackend):
    def __init__(self, result: SDNextGenerationResult | Exception) -> None:
        self._result = result

    async def generate_image(
        self, prompt: str, params: Dict[str, Any]
    ) -> SDNextGenerationResult:
        if isinstance(self._result, Exception):
            raise self._result
        return self._result

    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        return SDNextGenerationResult(job_id=job_id, status="completed")

    def is_available(self) -> bool:
        return True


class _RecordingNotifier(JobWebhookNotifier):
    def __init__(self) -> None:
        super().__init__("http://unused.invalid/hook")
        self.sent: List[Dict[str, Any]] = []

    async def send(self, payload):
        self.sent.append(dict(payload))
        return True


def _schedule_and_build_runner(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
    backend: _StaticBackend,
    *,
    client_ref: str | None = None,
):
    deliveries = DeliveryService(
        DeliveryJobRepository(db_session),
        queue_orchestrator=QueueOrchestrator(primary_backend=_SilentQueue()),
    )
    coordinator = GenerationCoordinator(
        deliveries, WebSocketService(), GenerationService()
    )
    job = coordinator.schedule_generation_job(
        SDNextGenerationParams(prompt="webhook test"),
        client_ref=client_ref,
    )

    registry = DeliveryRegistry()
    registry.register_generation_backend("sdnext", backend)
    notifier = _RecordingNotifier()

    @contextmanager
    def session_context():
        yield db_session

    monkeypatch.setattr(
        "backend.workers.delivery_runner.get_session_context",
        lambda: session_context(),
    )
    return job, DeliveryRunner(registry, webhook_notifier=notifier), notifier


def test_runner_notifies_when_job_succeeds(db_session, monkeypatch):
    """A finished job produces exactly one webhook with its client_ref."""
    job, runner, notifier = _schedule_and_build_runner(
        db_session,
        monkeypatch,
        _StaticBackend(
            SDNextGenerationResult(job_id="x", status="completed", images=["aW1n"])
        ),
        client_ref="n8n-form",
    )

    runner.process_delivery_job(job.id)

    assert len(notifier.sent) == 1
    sent = notifier.sent[0]
    assert sent["job_id"] == job.id
    assert sent["status"] == "succeeded"
    assert sent["client_ref"] == "n8n-form"
    assert sent["image_count"] == 1


def test_runner_notifies_when_job_fails_for_good(db_session, monkeypatch):
    """Failures without retries left are announced as ``failed``."""
    job, runner, notifier = _schedule_and_build_runner(
        db_session,
        monkeypatch,
        _StaticBackend(
            SDNextGenerationResult(
                job_id="x", status="failed", error_message="SDNext API not available"
            )
        ),
    )

    runner.process_delivery_job(job.id)

    assert [sent["status"] for sent in notifier.sent] == ["failed"]
    assert notifier.sent[0]["error"] == "SDNext API not available"


def test_runner_stays_quiet_while_a_job_will_be_retried(db_session, monkeypatch):
    """A ``retrying`` job is not final, so no webhook fires yet."""
    job, runner, notifier = _schedule_and_build_runner(
        db_session,
        monkeypatch,
        _StaticBackend(RuntimeError("transient")),
    )

    runner.process_delivery_job(job.id, retries_left=2)

    assert notifier.sent == []
