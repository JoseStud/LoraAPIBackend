"""Integration tests for backup history and creation endpoints."""

from __future__ import annotations

from pathlib import Path

from backend.core.config import settings


def test_backup_history_roundtrip(client, tmp_path, monkeypatch):
    """Ensure backup creation persists metadata and supports deletion."""

    monkeypatch.setattr(settings, "IMPORT_PATH", str(tmp_path))

    history_response = client.get("/api/v1/backups/history")
    assert history_response.status_code == 200
    assert history_response.json() == []

    create_response = client.post("/api/v1/backup/create", json={"backup_type": "full"})
    assert create_response.status_code == 200
    created = create_response.json()
    backup_id = created["backup_id"]
    assert created["success"] is True
    assert isinstance(backup_id, str) and backup_id

    backup_path = Path(tmp_path) / "backups" / f"{backup_id}.zip"
    assert backup_path.exists()

    history_after_create = client.get("/api/v1/backups/history")
    assert history_after_create.status_code == 200
    items = history_after_create.json()
    assert any(item["id"] == backup_id for item in items)

    delete_response = client.delete(f"/api/v1/backups/{backup_id}")
    assert delete_response.status_code == 204

    history_after_delete = client.get("/api/v1/backups/history")
    assert history_after_delete.status_code == 200
    remaining = history_after_delete.json()
    assert all(item["id"] != backup_id for item in remaining)
    assert not backup_path.exists()
