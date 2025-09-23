"""Basic API availability checks."""

from fastapi.testclient import TestClient


def test_health(client: TestClient):
    """Health endpoint returns ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_progress_websocket_uses_versioned_route(client: TestClient):
    """The progress WebSocket should be reachable via the versioned API path."""
    with client.websocket_connect("/api/v1/ws/progress") as websocket:
        websocket.send_json({"type": "subscribe", "job_ids": None})
