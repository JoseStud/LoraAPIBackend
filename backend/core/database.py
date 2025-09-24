"""Database helpers: engine creation, init and session factory.

This module respects the `DATABASE_URL` environment variable so tests and CI
can override the backend database (sqlite for local runs, Postgres in CI).
"""

from typing import Optional

from sqlalchemy.pool import NullPool
from sqlmodel import Session, create_engine

from backend.core.config import settings

# Allow overriding the DB via the configured settings or the DATABASE_URL env var
# `config.Settings` reads environment variables, so prefer settings.DATABASE_URL.
DATABASE_URL: Optional[str] = settings.DATABASE_URL


def _create_engine_from_url(database_url: str):
    """Create an engine applying SQLite-specific defaults when applicable."""
    if database_url.startswith("sqlite:"):
        # SQLite needs check_same_thread and a null pool in this project.
        return create_engine(
            database_url,
            echo=False,
            connect_args={"check_same_thread": False},
            poolclass=NullPool,
        )
    return create_engine(database_url, echo=False)


if DATABASE_URL:
    ENGINE = _create_engine_from_url(DATABASE_URL)
else:
    # Default to a local sqlite file beside the root directory
    import os

    # Go up to the root directory from app/core/
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    DB_FILE = os.path.join(root_dir, "db.sqlite")
    ENGINE = _create_engine_from_url(f"sqlite:///{DB_FILE}")


def init_db():
    """Ensure database migrations are applied for the configured engine."""
    from backend.core import migrations as migration_module

    migration_module.run_database_migrations()


def get_session():
    """Return a new Session bound to the module ENGINE with proper lifecycle management.

    This is a generator function intended for use as a FastAPI dependency.
    For direct usage, use get_session_context() instead.
    """
    with Session(ENGINE) as session:
        yield session


def get_session_context():
    """Return a new Session as a context manager for direct usage."""
    return Session(ENGINE)
