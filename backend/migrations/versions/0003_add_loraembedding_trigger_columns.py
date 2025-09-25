"""Add missing trigger-related columns to loraembedding table.

Revision ID: 0003_add_loraembedding_trigger_columns
Revises: 0002_add_deliveryjob_feedback_fields
Create Date: 2025-09-25 00:00:00.000000
"""

from typing import Set

import sqlalchemy as sa
from alembic import op

revision = "0003_add_loraembedding_trigger_columns"
down_revision = "0002_add_deliveryjob_feedback_fields"
branch_labels = None
depends_on = None

TABLE_NAME = "loraembedding"


def _existing_columns() -> Set[str]:
    """Get existing columns in the table to avoid duplicate column errors."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def upgrade() -> None:
    """Add missing trigger-related columns to loraembedding table."""
    existing = _existing_columns()

    # Determine dialect-specific JSON default expressions to ensure Postgres works
    # (requires explicit casts) while remaining compatible with SQLite.
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
        # Add normalized_triggers column (JSON array)
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

        # Add trigger_aliases column (JSON object/dict)
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

        # Add trigger_embeddings column (JSON array)
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

        # Add trigger_metadata column (JSON object/dict)
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

        # Drop server defaults after backfilling existing rows to avoid sticky defaults
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
    """Remove trigger-related columns from loraembedding table."""
    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        batch_op.drop_column("trigger_metadata")
        batch_op.drop_column("trigger_embeddings")
        batch_op.drop_column("trigger_aliases")
        batch_op.drop_column("normalized_triggers")
