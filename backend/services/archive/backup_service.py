"""Service responsible for managing archive backups and metadata."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional
from uuid import uuid4

from pydantic import TypeAdapter

from backend.core.config import settings
from backend.schemas.import_export import BackupHistoryItem
from backend.services.archive.facade import ArchiveService


class BackupService:
    """Persist backup metadata and materialize archive exports to disk."""

    _history_adapter = TypeAdapter(List[BackupHistoryItem])

    def __init__(
        self,
        archive_service: ArchiveService,
        *,
        base_directory: Optional[Path | str] = None,
    ) -> None:
        self._archive_service = archive_service
        root = Path(base_directory or settings.IMPORT_PATH or (Path.cwd() / "loras"))
        self._backups_dir = root / "backups"
        self._metadata_path = self._backups_dir / "history.json"
        self._backups_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_history(self) -> List[BackupHistoryItem]:
        """Return the stored backup history sorted by creation time."""

        history = self._load_history()
        return sorted(history, key=lambda item: item.created_at, reverse=True)

    def create_backup(self, backup_type: str = "full") -> BackupHistoryItem:
        """Create a new backup archive and persist metadata."""

        timestamp = datetime.now(timezone.utc)
        backup_id = self._generate_backup_id(timestamp)
        archive = self._archive_service.build_export_archive()
        file_path = self._persist_archive(archive.iterator, backup_id)

        size = file_path.stat().st_size if file_path.exists() else archive.size
        history = self._load_history()

        entry = BackupHistoryItem(
            id=backup_id,
            created_at=timestamp,
            type=self._format_backup_type(backup_type),
            size=size,
            status="completed",
        )
        history.append(entry)
        self._save_history(history)
        return entry

    def delete_backup(self, backup_id: str) -> bool:
        """Remove a backup archive and associated metadata."""

        history = self._load_history()
        remaining: List[BackupHistoryItem] = []
        removed = False
        for item in history:
            if item.id == backup_id:
                removed = True
                self._remove_archive_file(backup_id)
            else:
                remaining.append(item)

        if removed:
            self._save_history(remaining)
        return removed

    def get_backup_path(self, backup_id: str) -> Path:
        """Return the expected archive path for a backup ID."""

        return self._backups_dir / f"{backup_id}.zip"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_history(self) -> List[BackupHistoryItem]:
        if not self._metadata_path.exists():
            return []
        try:
            raw = json.loads(self._metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        return self._history_adapter.validate_python(raw)

    def _save_history(self, history: Iterable[BackupHistoryItem]) -> None:
        payload = [item.model_dump(mode="json") for item in history]
        tmp_path = self._metadata_path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        os.replace(tmp_path, self._metadata_path)

    def _persist_archive(self, iterator: Iterable[bytes], backup_id: str) -> Path:
        path = self.get_backup_path(backup_id)
        with path.open("wb") as handle:
            for chunk in iterator:
                handle.write(chunk)
        return path

    def _remove_archive_file(self, backup_id: str) -> None:
        path = self.get_backup_path(backup_id)
        try:
            path.unlink()
        except FileNotFoundError:
            return

    @staticmethod
    def _generate_backup_id(timestamp: datetime) -> str:
        suffix = uuid4().hex[:6]
        return f"backup_{timestamp.strftime('%Y%m%d_%H%M%S')}_{suffix}"

    @staticmethod
    def _format_backup_type(backup_type: str) -> str:
        normalized = backup_type.replace("_", " ").strip()
        return normalized.title() if normalized else "Backup"

