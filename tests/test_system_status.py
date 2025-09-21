"""Tests for the system status API endpoint."""

from backend.models.deliveries import DeliveryJob


def test_system_status_endpoint_returns_expected_payload(client):
    """The /system/status endpoint should return the expected payload shape."""

    response = client.get("/api/v1/system/status")

    assert response.status_code == 200
    payload = response.json()

    expected_keys = {
        "gpu_available",
        "queue_length",
        "status",
        "gpu_status",
        "memory_used",
        "memory_total",
        "active_workers",
        "backend",
        "queue_eta_seconds",
        "last_updated",
        "warnings",
        "metrics",
        "message",
        "updated_at",
    }

    assert expected_keys.issubset(payload.keys())
    assert isinstance(payload["warnings"], list)
    assert payload["queue_length"] >= 0


def test_system_status_reports_queue_activity(client, db_session):
    """Queue stats should include pending jobs as part of the active queue length."""

    job = DeliveryJob(prompt="test", mode="cli")
    db_session.add(job)
    db_session.commit()

    response = client.get("/api/v1/system/status")
    assert response.status_code == 200

    payload = response.json()
    assert payload["queue_length"] >= 1
