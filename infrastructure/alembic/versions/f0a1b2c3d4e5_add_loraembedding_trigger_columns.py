"""Add trigger-related columns to loraembedding table (infra chain).

Revision ID: f0a1b2c3d4e5
Revises: e3c1f6a5c2b8
Create Date: 2025-09-25 00:00:00.000000
"""

from typing import Set

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f0a1b2c3d4e5"
down_revision = "e3c1f6a5c2b8"
branch_labels = None
depends_on = None

TABLE_NAME = "loraembedding"


def _existing_columns() -> Set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {c["name"] for c in inspector.get_columns(TABLE_NAME)}


def upgrade() -> None:
    existing = _existing_columns()

    bind = op.get_bind()
    dialect = bind.dialect.name if bind is not None else ""

    def _json_array_default():
        return sa.text("'[]'::json") if dialect == "postgresql" else sa.text("'[]'")

    def _json_object_default():
        return sa.text("'{}'::json") if dialect == "postgresql" else sa.text("'{}'")

    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        added_normalized = False
        added_aliases = False
        added_embeddings = False
        added_metadata = False

        if "normalized_triggers" not in existing:
            batch_op.add_column(
                sa.Column(
                    "normalized_triggers",
                    sa.JSON(),
                    nullable=False,
                    server_default=_json_array_default(),
                )
            )
            added_normalized = True

        if "trigger_aliases" not in existing:
            batch_op.add_column(
                sa.Column(
                    "trigger_aliases",
                    sa.JSON(),
                    nullable=False,
                    server_default=_json_object_default(),
                )
            )
            added_aliases = True

        if "trigger_embeddings" not in existing:
            batch_op.add_column(
                sa.Column(
                    "trigger_embeddings",
                    sa.JSON(),
                    nullable=False,
                    server_default=_json_array_default(),
                )
            )
            added_embeddings = True

        if "trigger_metadata" not in existing:
            batch_op.add_column(
                sa.Column(
                    "trigger_metadata",
                    sa.JSON(),
                    nullable=False,
                    server_default=_json_object_default(),
                )
            )
            added_metadata = True

        # Drop server defaults post-backfill to avoid sticky defaults
        if added_normalized:
            batch_op.alter_column(
                "normalized_triggers",
                server_default=None,
                existing_type=sa.JSON(),
                existing_nullable=False,
            )
        if added_aliases:
            batch_op.alter_column(
                "trigger_aliases",
                server_default=None,
                existing_type=sa.JSON(),
                existing_nullable=False,
            )
        if added_embeddings:
            batch_op.alter_column(
                "trigger_embeddings",
                server_default=None,
                existing_type=sa.JSON(),
                existing_nullable=False,
            )
        if added_metadata:
            batch_op.alter_column(
                "trigger_metadata",
                server_default=None,
                existing_type=sa.JSON(),
                existing_nullable=False,
            )


def downgrade() -> None:
    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        batch_op.drop_column("trigger_metadata")
        batch_op.drop_column("trigger_embeddings")
        batch_op.drop_column("trigger_aliases")
        batch_op.drop_column("normalized_triggers")

