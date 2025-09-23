"""Delivery API tests."""

import uuid
from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def test_deliveries_enqueue(client: TestClient, mock_storage: MagicMock):
    """Compose with delivery should create a DeliveryJob and be retrievable."""
    mock_storage.exists.return_value = True

    name = "t2-" + uuid.uuid4().hex
    data = {
        "name": name,
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 0.5,
    }
    response = client.post("/api/v1/adapters", json=data)
    assert response.status_code == 201
    adapter_id = response.json()["adapter"]["id"]
    client.post(f"/api/v1/adapters/{adapter_id}/activate")

    payload = {"prefix": "p", "delivery": {"mode": "cli", "cli": {}}}
    response = client.post("/api/v1/compose", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body.get("warnings") == []
    assert body.get("delivery") and body["delivery"].get("id")
    delivery_id = body["delivery"]["id"]

    response = client.get(f"/api/v1/deliveries/{delivery_id}")
    assert response.status_code == 200
    delivery = response.json()["delivery"]
    assert delivery["id"] == delivery_id
