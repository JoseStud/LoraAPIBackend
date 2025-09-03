"""Tests for AdapterService.upsert_adapter and importer integration."""

from sqlalchemy.exc import IntegrityError

from backend.schemas.adapters import AdapterCreate
from backend.services import upsert_adapter_from_payload
from backend.services.adapters import AdapterService


def test_upsert_creates_and_updates(db_session, mock_storage):
    # initial create
    mock_storage.exists.return_value = True
    payload = AdapterCreate(
        name="u1",
        version="v1",
        tags=["a"],
        file_path="/tmp/u1.safetensors",
        weight=1.0,
    )

    a = upsert_adapter_from_payload(payload)
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
    b = upsert_adapter_from_payload(payload2)
    assert b.id == a.id
    assert b.tags == ["b", "c"]
    assert b.weight == 2.0


def test_duplicate_save_raises_integrity_error(db_session, mock_storage):
    """Direct save_adapter should raise IntegrityError when duplicate exists

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
