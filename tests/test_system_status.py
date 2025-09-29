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


def test_system_status_queue_counts_are_numeric(client, db_session):
    """Queue statistics should remain numeric even when multiple statuses exist."""

    jobs = [
        DeliveryJob(prompt="pending", mode="cli", status="pending"),
        DeliveryJob(prompt="running", mode="cli", status="running"),
        DeliveryJob(prompt="retrying", mode="cli", status="retrying"),
        DeliveryJob(prompt="failed", mode="cli", status="failed"),
        DeliveryJob(prompt="done", mode="cli", status="succeeded"),
    ]
    db_session.add_all(jobs)
    db_session.commit()

    response = client.get("/api/v1/system/status")
    assert response.status_code == 200

    payload = response.json()
    queue_stats = payload["queue"]

    for key in ("total", "active", "running", "failed"):
        assert isinstance(queue_stats[key], int)

    assert queue_stats["total"] == len(jobs)
    assert queue_stats["active"] == 3  # pending, running, retrying
    assert queue_stats["running"] == 1
    assert queue_stats["failed"] == 1

    assert isinstance(payload["queue_length"], int)
    assert payload["queue_length"] == queue_stats["active"]
    assert isinstance(payload["active_workers"], int)
