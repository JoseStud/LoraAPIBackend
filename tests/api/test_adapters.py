"""Adapter API integration tests."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.main import backend_app
from backend.api.v1 import adapters as adapters_router


def test_adapter_lifecycle(
    client: TestClient,
    mock_storage: MagicMock,
):
    """Happy-path lifecycle for creating, activating, composing, and deactivating."""
    mock_storage.exists.return_value = True

    name = "t1-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "tags": ["a"],
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    response = client.post("/api/v1/adapters", json=data)
    assert response.status_code == 201
    adapter = response.json()["adapter"]
    adapter_id = adapter["id"]

    response = client.get(f"/api/v1/adapters/{adapter_id}")
    assert response.status_code == 200

    response = client.post(f"/api/v1/adapters/{adapter_id}/activate")
    assert response.status_code == 200
    assert response.json()["adapter"]["active"] is True

    response = client.post(
        "/api/v1/compose",
        json={"prefix": "start", "suffix": "end"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "prompt" in payload
    assert "tokens" in payload
    assert payload.get("warnings") == []

    response = client.post(f"/api/v1/adapters/{adapter_id}/deactivate")
    assert response.status_code == 200
    assert response.json()["adapter"]["active"] is False


def test_create_adapters_allows_same_name_with_different_versions(
    client: TestClient,
    mock_storage: MagicMock,
):
    """Adapters may share a name as long as their versions differ."""
    mock_storage.exists.return_value = True

    base_name = "dup-" + uuid.uuid4().hex

    first = {
        "name": base_name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    response_one = client.post("/api/v1/adapters", json=first)
    assert response_one.status_code == 201

    second = {**first, "version": "v2", "file_path": "/fake/path2"}
    response_two = client.post("/api/v1/adapters", json=second)
    assert response_two.status_code == 201

    duplicate = {**first, "file_path": "/fake/path3"}
    response_three = client.post("/api/v1/adapters", json=duplicate)
    assert response_three.status_code == 400
    body = response_three.json()
    assert (
        body.get("detail") == "adapter with this name and version already exists"
        or body.get("title") == "adapter with this name and version already exists"
    )


def test_patch_adapter_rejects_invalid_payloads(
    client: TestClient,
    mock_storage: MagicMock,
):
    """Request validation rejects unsupported keys and incorrect types."""

    mock_storage.exists.return_value = True

    name = "patch-invalid-" + uuid.uuid4().hex
    payload = {
        "name": name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    creation = client.post("/api/v1/adapters", json=payload)
    creation.raise_for_status()
    adapter_id = creation.json()["adapter"]["id"]

    sentinel_services = SimpleNamespace(adapters=MagicMock())
    backend_app.dependency_overrides[adapters_router.get_domain_services] = (
        lambda: sentinel_services
    )
    try:
        response_type_error = client.patch(
            f"/api/v1/adapters/{adapter_id}",
            json={"weight": "heavy"},
        )
        assert response_type_error.status_code == 422

        response_unknown_key = client.patch(
            f"/api/v1/adapters/{adapter_id}",
            json={"unknown": 1},
        )
        assert response_unknown_key.status_code == 422

        assert sentinel_services.adapters.patch_adapter.call_count == 0
    finally:
        backend_app.dependency_overrides.pop(adapters_router.get_domain_services, None)


def test_patch_adapter_applies_valid_partial_update(
    client: TestClient,
    mock_storage: MagicMock,
):
    """Valid patch payload updates the adapter using service rules."""

    mock_storage.exists.return_value = True

    name = "patch-valid-" + uuid.uuid4().hex
    creation_payload = {
        "name": name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    creation = client.post("/api/v1/adapters", json=creation_payload)
    creation.raise_for_status()
    adapter_id = creation.json()["adapter"]["id"]

    patch_response = client.patch(
        f"/api/v1/adapters/{adapter_id}",
        json={"weight": 0.5, "active": True},
    )
    assert patch_response.status_code == 200
    patched_adapter = patch_response.json()["adapter"]
    assert patched_adapter["weight"] == 0.5
    assert patched_adapter["active"] is True
