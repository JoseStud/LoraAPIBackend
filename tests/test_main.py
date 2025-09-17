"""Tests for the HTTP API, using FastAPI's TestClient and pytest fixtures."""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def test_health(client: TestClient):
    """Health endpoint returns ok."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_adapter_lifecycle(client: TestClient, mock_storage: MagicMock):
    """Full adapter lifecycle: create, read, activate, compose, deactivate."""
    mock_storage.exists.return_value = True
    import uuid

    name = "t1-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "tags": ["a"],
        "file_path": "/fake/path",
        "weight": 1.0,
    }
    r = client.post("/v1/adapters", json=data)
    assert r.status_code == 201
    adapter = r.json()["adapter"]
    aid = adapter["id"]

    r = client.get(f"/v1/adapters/{aid}")
    assert r.status_code == 200

    r = client.post(f"/v1/adapters/{aid}/activate")
    assert r.status_code == 200
    assert r.json()["adapter"]["active"] is True

    r = client.post("/v1/compose", json={"prefix": "start", "suffix": "end"})
    assert r.status_code == 200
    js = r.json()
    assert "prompt" in js
    assert "tokens" in js

    r = client.post(f"/v1/adapters/{aid}/deactivate")
    assert r.status_code == 200
    assert r.json()["adapter"]["active"] is False


def test_deliveries_enqueue(client: TestClient, mock_storage: MagicMock):
    """Compose with delivery should create a DeliveryJob and be retrievable."""
    mock_storage.exists.return_value = True
    import uuid

    name = "t2-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 0.5,
    }
    r = client.post("/v1/adapters", json=data)
    assert r.status_code == 201
    aid = r.json()["adapter"]["id"]
    client.post(f"/v1/adapters/{aid}/activate")

    # compose with delivery -> should create a delivery job and return id
    payload = {"prefix": "p", "delivery": {"mode": "cli", "cli": {}}}
    r = client.post("/v1/compose", json=payload)
    assert r.status_code == 200
    js = r.json()
    assert js.get("delivery") and js["delivery"].get("id")
    did = js["delivery"]["id"]

    r = client.get(f"/v1/deliveries/{did}")
    assert r.status_code == 200
    dj = r.json()["delivery"]
    assert dj["id"] == did
