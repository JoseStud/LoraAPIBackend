"""Tests for AdapterService.upsert_adapter and importer integration."""

from sqlalchemy.exc import IntegrityError

from backend.schemas.adapters import AdapterCreate
from backend.services import get_service_container_builder
from backend.services.adapters import AdapterService
from backend.services.analytics_repository import AnalyticsRepository


def test_upsert_creates_and_updates(db_session, mock_storage):
    """Test that upsert creates and updates adapters correctly."""
    # initial create
    mock_storage.exists.return_value = True
    builder = get_service_container_builder()
    services = builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        recommendation_gpu_available=False,
    )
    adapter_service = services.domain.adapters
    payload = AdapterCreate(
        name="u1",
        version="v1",
        tags=["a"],
        file_path="/tmp/u1.safetensors",
        weight=1.0,
    )

    a = adapter_service.upsert_adapter(payload)
    assert a.id is not None
    assert a.name == "u1"
    assert a.tags == ["a"]

    # update: change tags and weight
    payload2 = AdapterCreate(
        name="u1",
        version="v1",
        tags=["b", "c"],
        file_path="/tmp/u1.safetensors",
        weight=2.0,
    )
    b = adapter_service.upsert_adapter(payload2)
    assert b.id == a.id
    assert b.tags == ["b", "c"]
    assert b.weight == 2.0


def test_zero_weight_preserved_on_save_and_update(db_session, mock_storage):
    """Adapters must persist zero weights through create and update flows."""
    mock_storage.exists.return_value = True

    svc = AdapterService(db_session)

    payload_zero = AdapterCreate(
        name="zero-weight",
        version="v1",
        tags=["zw"],
        file_path="/tmp/zero.safetensors",
        weight=0.0,
    )

    created = svc.save_adapter(payload_zero)
    assert created.weight == 0.0

    # Upsert with explicit zero should not be overwritten by default weight
    updated = svc.upsert_adapter(payload_zero)
    assert updated.weight == 0.0

def test_duplicate_save_raises_integrity_error(db_session, mock_storage):
    """Direct save_adapter should raise IntegrityError when duplicate exists.

    This verifies the database-level unique index on (name, version) is
    enforced in tests (we create the index in the test fixture).
    """
    mock_storage.exists.return_value = True
    payload = AdapterCreate(
        name="dup",
        version="1",
        tags=["t"],
        file_path="/tmp/dup.safetensors",
        weight=1.0,
    )

    svc = AdapterService(db_session)
    # first save should succeed
    a = svc.save_adapter(payload)
    assert a.id is not None

    # second save with same name+version should violate unique index
    payload2 = AdapterCreate(
        name="dup",
        version="1",
        tags=["t2"],
        file_path="/tmp/dup2.safetensors",
        weight=1.0,
    )

    try:
        svc.save_adapter(payload2)
        raised = False
    except IntegrityError:
        raised = True

    assert raised, "Expected IntegrityError when inserting duplicate adapter"
