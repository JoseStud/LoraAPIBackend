"""Helpers for running Alembic migrations programmatically."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from alembic import command
from alembic.config import Config


def _resolve_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _build_config(database_url: Optional[str] = None) -> Config:
    root = _resolve_project_root()

    # Allow Docker/infrastructure to opt into infra-managed alembic
    prefer_infra = os.getenv("PREFER_INFRA_MIGRATIONS", "").lower() in {"1", "true", "yes"}
    ini_path = root / ("infrastructure/alembic.ini" if prefer_infra else "alembic.ini")
    config = Config(str(ini_path))
    if prefer_infra:
        config.set_main_option("script_location", str(root / "infrastructure" / "alembic"))
    else:
        config.set_main_option("script_location", str(root / "backend" / "migrations"))

    if database_url is None:
        from backend.core.database import ENGINE

        database_url = ENGINE.url.render_as_string(hide_password=False)

    config.set_main_option("sqlalchemy.url", database_url)
    return config


def run_database_migrations(
    revision: str = "head", *, database_url: Optional[str] = None
) -> None:
    """Upgrade the configured database to ``revision`` (defaults to ``head``).

    Set environment variables to control behavior:
    - SKIP_APP_DB_MIGRATIONS=1 to disable programmatic migrations (Docker runs them).
    - PREFER_INFRA_MIGRATIONS=1 to use infrastructure/alembic instead of backend/migrations.
    """
    if os.getenv("SKIP_APP_DB_MIGRATIONS", "").lower() in {"1", "true", "yes"}:
        return
    config = _build_config(database_url)
    command.upgrade(config, revision)


__all__ = ["run_database_migrations"]
