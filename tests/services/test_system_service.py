from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, SQLModel, create_engine

from backend.models import Adapter
from backend.services.system import SystemHealthSummary, SystemService


class DummyDeliveryService:
    def __init__(self, stats: dict[str, int], session: Session | None = None) -> None:
        self._stats = stats
        self._session = session

    def get_queue_statistics(self) -> dict[str, int]:
        return self._stats

    @property
    def db_session(self) -> Session | None:
        return self._session


def _setup_session_with_adapter(*, last_ingested_at: datetime | None) -> Session:
    engine = create_engine("sqlite://", echo=False)
    SQLModel.metadata.create_all(engine)
    session = Session(engine)

    adapter = Adapter(
        name="Example",
        version="1.0",
        file_path="/tmp/example.safetensors",
        last_ingested_at=last_ingested_at,
        created_at=last_ingested_at,
        updated_at=last_ingested_at,
        active=True,
    )
    session.add(adapter)
    session.commit()

    return session


@pytest.mark.anyio
async def test_system_status_reports_extended_fields(monkeypatch):
    recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    session = _setup_session_with_adapter(last_ingested_at=recent_cutoff)

    service = SystemService(
        DummyDeliveryService({"active": 6, "failed": 2, "running": 1}, session),
        queue_warning_active=5,
        queue_warning_failed=1,
        importer_stale_hours=1,
    )

    monkeypatch.setattr(
        "backend.services.system.detect_gpu",
        lambda: {"available": True, "details": {"device_name": "Test GPU"}},
    )
    monkeypatch.setattr(
        "backend.services.system.get_gpu_memory_info",
        lambda: {"total": 1024 * 1024 * 8, "allocated": 1024 * 1024 * 4},
    )

    async def fake_sdnext_status(self):
        return {"configured": True, "available": False, "error": "network"}

    async def fake_recommendation_status(self):
        return {"models_loaded": False, "gpu_available": True}

    monkeypatch.setattr(SystemService, "_gather_sdnext_status", fake_sdnext_status)
    monkeypatch.setattr(SystemService, "_gather_recommendation_status", fake_recommendation_status)

    payload = await service.get_system_status_payload()

    assert payload["status"] == "warning"
    assert payload["sdnext"]["configured"] is True
    assert payload["sdnext"]["available"] is False
    assert payload["recommendations"]["models_loaded"] is False
    assert payload["importer"]["stale"] is False
    assert payload["thresholds"]["queue"]["active_warning"] == 5

    warnings = " ".join(payload.get("warnings", []))
    assert "Queue backlog above threshold" in warnings
    assert "Delivery failures exceed threshold" in warnings
    assert "SDNext backend unavailable" in warnings
    assert "Recommendation models not preloaded" in warnings

    summary = await service.get_health_summary()
    assert isinstance(summary, SystemHealthSummary)

    session.close()
    session.bind.dispose()


@pytest.mark.anyio
async def test_system_status_handles_healthy_runtime(monkeypatch):
    session = _setup_session_with_adapter(last_ingested_at=datetime.now(timezone.utc))

    service = SystemService(
        DummyDeliveryService({"active": 0, "failed": 0, "running": 0}, session),
        queue_warning_active=None,
        queue_warning_failed=None,
        importer_stale_hours=0,
    )

    monkeypatch.setattr(
        "backend.services.system.detect_gpu",
        lambda: {"available": True, "details": {"device_name": "Test GPU"}},
    )
    monkeypatch.setattr(
        "backend.services.system.get_gpu_memory_info",
        lambda: {"total": 1024 * 1024 * 8, "allocated": 1024 * 1024 * 2},
    )

    async def healthy_sdnext(self):
        return {"configured": True, "available": True}

    async def healthy_recommendations(self):
        return {"models_loaded": True, "gpu_available": True}

    monkeypatch.setattr(SystemService, "_gather_sdnext_status", healthy_sdnext)
    monkeypatch.setattr(SystemService, "_gather_recommendation_status", healthy_recommendations)

    payload = await service.get_system_status_payload()

    assert payload["status"] == "healthy"
    assert payload.get("warnings") == []
    assert payload["importer"]["stale"] is None
    assert payload["thresholds"]["importer"]["stale_hours"] == 0

    session.close()
    session.bind.dispose()
