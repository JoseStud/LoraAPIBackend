"""Helpers for running Alembic migrations programmatically."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from alembic import command
from alembic.config import Config


def _resolve_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _build_config(database_url: Optional[str] = None) -> Config:
    root = _resolve_project_root()
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "backend" / "migrations"))

    if database_url is None:
        from backend.core.database import ENGINE

        database_url = ENGINE.url.render_as_string(hide_password=False)

    config.set_main_option("sqlalchemy.url", database_url)
    return config


def run_database_migrations(revision: str = "head", *, database_url: Optional[str] = None) -> None:
    """Upgrade the configured database to ``revision`` (defaults to ``head``)."""

    config = _build_config(database_url)
    command.upgrade(config, revision)


__all__ = ["run_database_migrations"]
