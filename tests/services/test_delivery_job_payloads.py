"""The typed models for a delivery job's stored ``params`` and ``result``."""

import json

import pytest

from backend.schemas import DeliveryJobParams, DeliveryJobResult, SDNextGenerationResult
from backend.services.analytics.service import AnalyticsService
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobMapper
from backend.services.job_webhooks import JobWebhookNotifier
from tests.util.delivery_jobs import set_job_status


def test_generation_result_round_trips_unchanged():
    stored = SDNextGenerationResult(
        job_id="sd-1",
        status="completed",
        images=["output://a.png"],
        progress=1.0,
        generation_info={"seed": 7},
    ).model_dump()

    result = DeliveryJobResult.parse_json(json.dumps(stored))

    assert result is not None
    assert result.to_payload() == stored
    assert result.images == ["output://a.png"]
    assert result.generation_info == {"seed": 7}
    assert result.error_message is None


def test_params_round_trip_keeps_unknown_keys():
    stored = {
        "generation_params": {"prompt": "p", "steps": 20},
        "backend": "sdnext",
        "mode": "deferred",
        "save_images": True,
        "return_format": "url",
        "client_ref": "n8n",
        "custom": {"nested": [1, 2]},
    }

    params = DeliveryJobParams.parse_json(json.dumps(stored))

    assert params is not None
    assert params.to_payload() == stored
    assert params.backend == "sdnext"
    assert params.generation_fields() == {"prompt": "p", "steps": 20}


def test_legacy_flat_params_are_the_generation_fields():
    params = DeliveryJobParams.coerce({"prompt": "p", "width": 512})

    assert params.generation_params is None
    assert params.generation_fields() == {"prompt": "p", "width": 512}


def test_unknown_result_keys_are_kept():
    result = DeliveryJobResult.coerce({"status": 200, "detail": "ok", "headers": {}})

    assert result.status == 200
    assert result.status_message == "ok"
    assert result.to_payload() == {"status": 200, "detail": "ok", "headers": {}}


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ({"error": "Delivery processing failed"}, "Delivery processing failed"),
        ({"error_message": "no images"}, "no images"),
        ({"error_message": None, "error": "legacy"}, "legacy"),
        ({"error_message": "", "error": "legacy"}, "legacy"),
    ],
)
def test_legacy_error_key_reads_as_error_message(stored, expected):
    result = DeliveryJobResult.coerce(stored)

    assert result.error_message == expected
    assert "error" not in result.to_payload()
    assert result.failure_message == expected


def test_error_stays_extra_when_error_message_is_set():
    result = DeliveryJobResult.coerce({"error_message": "new", "error": "old"})

    assert result.error_message == "new"
    assert result.to_payload() == {"error_message": "new", "error": "old"}


def test_failure_message_falls_back_to_detail_then_message():
    assert DeliveryJobResult(detail="http 500").failure_message == "http 500"
    assert DeliveryJobResult(message="stopped").failure_message == "stopped"
    assert DeliveryJobResult(message="m", detail="d").status_message == "m"
    assert DeliveryJobResult(status="completed").failure_message is None


@pytest.mark.parametrize(
    ("stored", "expected"),
    [(50, 0.5), (0.25, 0.25), (1, 1.0), (150, 1.0), ("x", None), (True, None)],
)
def test_progress_is_read_as_a_fraction(stored, expected):
    assert DeliveryJobResult.coerce({"progress": stored}).progress == expected


def test_wrongly_typed_fields_read_as_none():
    result = DeliveryJobResult.coerce({
        "status": ["x"],
        "images": "not-a-list",
        "error_message": 5,
        "generation_info": "{not json",
        "retries_left": "2",
    })

    assert result.status is None
    assert result.images is None
    assert result.error_message is None
    assert result.generation_info is None
    assert result.retries_left is None


def test_result_cleans_images_and_decodes_generation_info():
    result = DeliveryJobResult.coerce({
        "images": ["output://a.png", None, 3, "output://b.png"],
        "generation_info": json.dumps({"seed": 1}),
    })

    assert result.images == ["output://a.png", "output://b.png"]
    assert result.generation_info == {"seed": 1}


@pytest.mark.parametrize("raw", [None, "", "{not json", "[1, 2]", '"text"', "3"])
def test_missing_or_malformed_columns(raw):
    mapper = DeliveryJobMapper()

    assert mapper.deserialize_result(raw) is None
    assert mapper.deserialize_params(raw) == DeliveryJobParams()
    assert mapper.deserialize_params(raw).to_payload() == {}


def test_mapper_writes_the_model_payload():
    mapper = DeliveryJobMapper()

    assert mapper.serialize_result(None) is None
    assert json.loads(mapper.serialize_result({"error": "boom"})) == {
        "error_message": "boom"
    }
    assert json.loads(mapper.serialize_params(None)) == {}


def test_stored_legacy_row_reads_through_the_service(
    delivery_service: DeliveryService,
):
    job = delivery_service.create_job("p", "sdnext", {"prompt": "p"})
    set_job_status(delivery_service, job.id, "running")
    # A row as the runner wrote it before ``error_message`` was canonical.
    stored = delivery_service.get_job(job.id)
    stored.result = json.dumps({"error": "Delivery processing failed", "progress": 40})
    delivery_service.db_session.add(stored)
    delivery_service.db_session.commit()

    result = delivery_service.get_job_result(stored)

    assert result.error_message == "Delivery processing failed"
    assert result.progress == 0.4
    assert delivery_service.get_job_params(stored).generation_fields() == {
        "prompt": "p"
    }


def test_webhook_reports_legacy_runner_errors():
    payload = JobWebhookNotifier.build_payload(
        "job-1", "failed", "p", {}, {"error": "Delivery processing failed"}
    )

    assert payload["error"] == "Delivery processing failed"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, "Unknown error"),
        (
            json.dumps({"error": "Delivery processing failed"}),
            "Delivery processing failed",
        ),
        (json.dumps({"status": "failed", "error_message": "x "}), "x"),
        (json.dumps({"status": "error", "detail": "timeout"}), "timeout"),
        (json.dumps({"status": "failed"}), "Unknown error"),
        ("plain text failure", "plain text failure"),
    ],
)
def test_analytics_error_breakdown_reads_the_failure_message(raw, expected):
    service = AnalyticsService.__new__(AnalyticsService)

    assert service._extract_error_message(raw) == expected
