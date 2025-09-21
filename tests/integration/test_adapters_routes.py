"""Integration tests for adapter auxiliary routes (tags, bulk actions)."""

import uuid
from typing import List
from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def _create_adapter(client: TestClient, name_suffix: str, tags: List[str]) -> str:
    """Create an adapter and return its id."""
    data = {
        "name": f"test-{name_suffix}-{uuid.uuid4().hex[:8]}",
        "version": "v1",
        "file_path": "/fake/path",
        "weight": 1.0,
        "tags": tags,
    }
    r = client.post("/api/v1/adapters", json=data)
    assert r.status_code == 201, r.text
    return r.json()["adapter"]["id"]


def test_adapter_tags_and_bulk_actions(client: TestClient, mock_storage: MagicMock):
    """Ensure tags endpoint aggregates unique tags and bulk actions mutate state."""
    # Pretend files exist for adapter creation validation
    mock_storage.exists.return_value = True

    # Create a few adapters with overlapping tags
    id1 = _create_adapter(client, "a", ["alpha", "beta"]) 
    id2 = _create_adapter(client, "b", ["beta", "gamma"]) 

    # GET /v1/adapters/tags => should contain unique union of tags
    r = client.get("/api/v1/adapters/tags")
    assert r.status_code == 200
    tags = set(r.json().get("tags", []))
    assert {"alpha", "beta", "gamma"}.issubset(tags)

    # Bulk activate both
    r = client.post("/api/v1/adapters/bulk", json={
        "action": "activate",
        "lora_ids": [id1, id2],
    })
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert body.get("processed") == 2

    # Verify active state flipped
    r1 = client.get(f"/api/v1/adapters/{id1}")
    r2 = client.get(f"/api/v1/adapters/{id2}")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["adapter"]["active"] is True
    assert r2.json()["adapter"]["active"] is True

    # Bulk delete first
    r = client.post("/api/v1/adapters/bulk", json={
        "action": "delete",
        "lora_ids": [id1],
    })
    assert r.status_code == 200
    assert r.json().get("processed") == 1

    # Verify first is gone, second remains
    r = client.get(f"/api/v1/adapters/{id1}")
    assert r.status_code == 404
    r = client.get(f"/api/v1/adapters/{id2}")
    assert r.status_code == 200

