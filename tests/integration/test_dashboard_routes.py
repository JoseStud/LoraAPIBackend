"""Integration tests for dashboard API endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.models.adapters import Adapter
from backend.models.deliveries import DeliveryJob


def _make_adapter(
    name: str,
    *,
    active: bool = True,
    created_at: datetime,
    updated_at: datetime,
    last_ingested_at: Optional[datetime] = None,
) -> Adapter:
    return Adapter(
        name=name,
        version="1.0",
        file_path=f"/tmp/{name}.safetensors",
        active=active,
        created_at=created_at,
        updated_at=updated_at,
        last_ingested_at=last_ingested_at,
    )


def test_dashboard_stats_reflects_live_data(client, db_session):
    """Dashboard stats should mirror values from the database."""
    now = datetime.now(timezone.utc)
    earlier = now - timedelta(days=2)

    fresh_adapter = _make_adapter(
        "fresh",
        created_at=now,
        updated_at=now,
        last_ingested_at=now,
    )
    old_adapter = _make_adapter(
        "stale",
        active=False,
        created_at=earlier,
        updated_at=earlier,
        last_ingested_at=earlier,
    )

    pending_job = DeliveryJob(
        prompt="pending job",
        mode="api",
        status="pending",
        created_at=now,
    )
    failed_job = DeliveryJob(
        prompt="failed job",
        mode="api",
        status="failed",
        created_at=now - timedelta(hours=1),
    )

    db_session.add_all([fresh_adapter, old_adapter, pending_job, failed_job])
    db_session.commit()

    response = client.get("/api/v1/dashboard/stats")
    assert response.status_code == 200

    payload = response.json()
    stats = payload["stats"]
    system_health = payload["system_health"]

    assert stats["total_loras"] == 2
    assert stats["active_loras"] == 1
    assert stats["recent_imports"] == 1
    assert stats["active_jobs"] == 1

    assert system_health["queue_status"] == "active"
    assert system_health["status"] in {"healthy", "warning"}
    assert isinstance(system_health["gpu_status"], str) and system_health["gpu_status"]
    assert isinstance(system_health["gpu_memory"], str)
    assert (
        isinstance(system_health["storage_usage"], str)
        and system_health["storage_usage"]
    )


def test_dashboard_endpoints_handle_empty_dataset(client):
    """Endpoints should gracefully handle empty databases."""
    stats_response = client.get("/api/v1/dashboard/stats")
    assert stats_response.status_code == 200
    stats_payload = stats_response.json()
    assert stats_payload["stats"] == {
        "total_loras": 0,
        "active_loras": 0,
        "embeddings_coverage": 0,
        "recent_imports": 0,
        "active_jobs": 0,
    }
    assert stats_payload["system_health"]["queue_status"] == "idle"

    featured_response = client.get("/api/v1/dashboard/featured-loras")
    assert featured_response.status_code == 200
    assert featured_response.json() == []

    activity_response = client.get("/api/v1/dashboard/activity-feed")
    assert activity_response.status_code == 200
    assert activity_response.json() == []


def test_featured_loras_returns_recent_active_adapters(client, db_session):
    """Featured endpoint should return active adapters ordered by recency."""
    now = datetime.now(timezone.utc)
    adapters = [
        _make_adapter(
            "alpha",
            created_at=now - timedelta(hours=4),
            updated_at=now - timedelta(hours=2),
        ),
        _make_adapter(
            "beta",
            created_at=now - timedelta(hours=3),
            updated_at=now - timedelta(minutes=30),
        ),
        _make_adapter(
            "gamma",
            created_at=now - timedelta(hours=5),
            updated_at=now - timedelta(hours=1),
        ),
        _make_adapter("delta", active=False, created_at=now, updated_at=now),
    ]
    db_session.add_all(adapters)
    db_session.commit()

    response = client.get("/api/v1/dashboard/featured-loras")
    assert response.status_code == 200
    payload = response.json()

    assert len(payload) == 3
    returned_names = [item["name"] for item in payload]
    assert returned_names == ["beta", "gamma", "alpha"]


def test_activity_feed_reflects_recent_jobs(client, db_session):
    """Activity feed should include delivery jobs sorted by recency."""
    now = datetime.now(timezone.utc)
    jobs = [
        DeliveryJob(
            prompt="first",
            mode="api",
            status="succeeded",
            created_at=now - timedelta(hours=2),
        ),
        DeliveryJob(
            prompt="second",
            mode="api",
            status="running",
            created_at=now - timedelta(hours=1),
        ),
        DeliveryJob(prompt="third", mode="cli", status="pending", created_at=now),
    ]
    db_session.add_all(jobs)
    db_session.commit()

    response = client.get("/api/v1/dashboard/activity-feed")
    assert response.status_code == 200
    payload = response.json()

    assert [item["prompt"] for item in payload[:3]] == ["third", "second", "first"]
    for entry in payload[:3]:
        assert entry["icon"]
        assert entry["timestamp"].endswith("Z") or "T" in entry["timestamp"]
        assert entry["message"].startswith("Delivery job")
