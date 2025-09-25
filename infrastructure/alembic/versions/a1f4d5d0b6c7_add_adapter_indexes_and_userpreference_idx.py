"""Restore adapter indexes and add user preference composite index.

Revision ID: a1f4d5d0b6c7
Revises: 7ef61e651ef8
Create Date: 2025-08-30 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1f4d5d0b6c7"
# Depend on both the recommendation tables and the adapter ingestion fields
down_revision = ("7ef61e651ef8", "cbab2373ecb9")
branch_labels = None
depends_on = None


def upgrade():
    """Apply index additions for adapters and user preferences (idempotent)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    adapter_indexes = {idx["name"] for idx in inspector.get_indexes("adapter")}
    userpref_indexes = {
        idx["name"] for idx in inspector.get_indexes("userpreference")
    }

    # Only add indexes that aren't handled by other revisions
    if "idx_adapter_json_file_path" not in adapter_indexes:
        op.create_index(
            "idx_adapter_json_file_path", "adapter", ["json_file_path"], unique=False
        )
    if "idx_adapter_updated_at" not in adapter_indexes:
        op.create_index(
            "idx_adapter_updated_at", "adapter", ["updated_at"], unique=False
        )
    if "idx_adapter_last_ingested_at" not in adapter_indexes:
        op.create_index(
            "idx_adapter_last_ingested_at", "adapter", ["last_ingested_at"], unique=False
        )

    if "ix_userpreference_type_value" not in userpref_indexes:
        op.create_index(
            "ix_userpreference_type_value",
            "userpreference",
            ["preference_type", "preference_value"],
            unique=False,
        )


def downgrade():
    """Remove index additions for adapters and user preferences."""
    op.drop_index("ix_userpreference_type_value", table_name="userpreference")
    op.drop_index("idx_adapter_last_ingested_at", table_name="adapter")
    op.drop_index("idx_adapter_updated_at", table_name="adapter")
    op.drop_index("idx_adapter_created_at", table_name="adapter")
    op.drop_index("idx_adapter_json_file_path", table_name="adapter")
    op.drop_index("idx_adapter_active", table_name="adapter")
