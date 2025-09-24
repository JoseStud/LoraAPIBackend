"""Restore adapter indexes and add user preference composite index.

Revision ID: a1f4d5d0b6c7
Revises: 7ef61e651ef8
Create Date: 2025-08-30 00:00:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "a1f4d5d0b6c7"
down_revision = "7ef61e651ef8"
branch_labels = None
depends_on = None


def upgrade():
    """Apply index additions for adapters and user preferences."""
    op.create_index("idx_adapter_active", "adapter", ["active"], unique=False)
    op.create_index(
        "idx_adapter_json_file_path",
        "adapter",
        ["json_file_path"],
        unique=False,
    )
    op.create_index("idx_adapter_created_at", "adapter", ["created_at"], unique=False)
    op.create_index("idx_adapter_updated_at", "adapter", ["updated_at"], unique=False)
    op.create_index(
        "idx_adapter_last_ingested_at",
        "adapter",
        ["last_ingested_at"],
        unique=False,
    )
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
