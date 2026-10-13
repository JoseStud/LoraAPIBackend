"""Add CivitAI identity and preview columns, and unique file identity.

Adds ``civitai_model_id``, ``civitai_version_id`` and ``preview_image_url`` to
``adapter`` and makes ``primary_file_sha256`` and ``civitai_version_id``
unique, so the same LoRA file cannot be registered twice under different
names. Existing hashes are normalised to upper case first; if duplicates
remain the upgrade stops and names them instead of dropping data.

Revision ID: 0004_add_adapter_file_identity
Revises: 0003_add_loraembedding_trigger_columns
Create Date: 2026-10-13 00:00:00.000000
"""

from typing import Set

import sqlalchemy as sa
from alembic import op
from sqlmodel.sql.sqltypes import AutoString

revision = "0004_add_adapter_file_identity"
down_revision = "0003_add_loraembedding_trigger_columns"
branch_labels = None
depends_on = None

TABLE_NAME = "adapter"


def _existing_columns() -> Set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def _fail_on_duplicates(column: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            f"SELECT {column}, COUNT(*) FROM {TABLE_NAME} "
            f"WHERE {column} IS NOT NULL GROUP BY {column} HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if rows:
        values = ", ".join(str(row[0]) for row in rows[:10])
        raise RuntimeError(
            f"Cannot add unique index on adapter.{column}: {len(rows)} duplicate "
            f"value(s) ({values}). Remove the duplicate adapters and rerun the "
            "migration."
        )


def upgrade() -> None:
    """Add identity columns and unique indexes."""
    existing = _existing_columns()

    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        if "civitai_model_id" not in existing:
            batch_op.add_column(
                sa.Column("civitai_model_id", sa.Integer(), nullable=True)
            )
        if "civitai_version_id" not in existing:
            batch_op.add_column(
                sa.Column("civitai_version_id", sa.Integer(), nullable=True)
            )
        if "preview_image_url" not in existing:
            batch_op.add_column(
                sa.Column("preview_image_url", AutoString(), nullable=True)
            )

    op.execute(
        sa.text(
            f"UPDATE {TABLE_NAME} SET primary_file_sha256 = NULL "
            "WHERE TRIM(primary_file_sha256) = ''"
        )
    )
    op.execute(
        sa.text(
            f"UPDATE {TABLE_NAME} SET primary_file_sha256 = "
            "UPPER(TRIM(primary_file_sha256)) WHERE primary_file_sha256 IS NOT NULL"
        )
    )
    _fail_on_duplicates("primary_file_sha256")
    _fail_on_duplicates("civitai_version_id")

    op.create_index(
        "ux_adapter_primary_file_sha256",
        TABLE_NAME,
        ["primary_file_sha256"],
        unique=True,
    )
    op.create_index(
        "ux_adapter_civitai_version_id",
        TABLE_NAME,
        ["civitai_version_id"],
        unique=True,
    )


def downgrade() -> None:
    """Drop identity indexes and columns."""
    op.drop_index("ux_adapter_civitai_version_id", table_name=TABLE_NAME)
    op.drop_index("ux_adapter_primary_file_sha256", table_name=TABLE_NAME)
    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        batch_op.drop_column("preview_image_url")
        batch_op.drop_column("civitai_version_id")
        batch_op.drop_column("civitai_model_id")
