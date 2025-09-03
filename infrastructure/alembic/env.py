"""Alembic env configuration wired to the app's SQLModel metadata.

This file prefers the runtime `ENGINE` exported by `db.py` when available
so autogeneration in local tests uses the same engine. It also falls back to
the `DATABASE_URL` env var or the `alembic.ini` configuration.
"""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import backend metadata
try:
    # Add parent directory to path to import from backend
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from backend.models import SQLModel

    target_metadata = SQLModel.metadata
except Exception:
    target_metadata = None

# Prefer DATABASE_URL env var or fall back to alembic.ini's sqlalchemy.url
db_url = os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url")


def get_engine():
    """Return the project's SQLAlchemy Engine, preferring the runtime ENGINE.

    If the project's `db.py` exposes `ENGINE` import and return it. Otherwise,
    create an engine from alembic config using the resolved URL.
    """
    # Try to import the project's ENGINE if available (db.py creates it)
    try:
        from backend.core.database import ENGINE

        return ENGINE
    except Exception:
        # create a SQLAlchemy engine from alembic config using the resolved URL
        if db_url:
            config.set_main_option("sqlalchemy.url", str(db_url))
        engine = engine_from_config(
            config.get_section(config.config_ini_section),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )
        return engine


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.
    """
    url = db_url
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = get_engine()

    # If using SQLite, enable batch mode for ALTER operations
    is_sqlite = False
    try:
        url = str(connectable.url)
        if url.startswith("sqlite:"):
            is_sqlite = True
    except Exception:
        pass

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
