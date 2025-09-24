"""Add feedback metadata columns to delivery jobs.

Revision ID: 0002_add_deliveryjob_feedback_fields
Revises: 0001_initial_schema
Create Date: 2025-09-24 00:00:00.000000
"""

from typing import Set

import sqlalchemy as sa
from alembic import op

revision = "0002_add_deliveryjob_feedback_fields"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

TABLE_NAME = "deliveryjob"


def _existing_columns() -> Set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def upgrade() -> None:
    existing = _existing_columns()

    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        if "rating" not in existing:
            batch_op.add_column(sa.Column("rating", sa.Integer(), nullable=True))

        if "is_favorite" not in existing:
            batch_op.add_column(
                sa.Column(
                    "is_favorite",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )

        if "rating_updated_at" not in existing:
            batch_op.add_column(
                sa.Column(
                    "rating_updated_at",
                    sa.DateTime(timezone=True),
                    nullable=True,
                ),
            )

        if "favorite_updated_at" not in existing:
            batch_op.add_column(
                sa.Column(
                    "favorite_updated_at",
                    sa.DateTime(timezone=True),
                    nullable=True,
                ),
            )

        if "is_favorite" not in existing:
            batch_op.alter_column(
                "is_favorite",
                server_default=None,
                existing_type=sa.Boolean(),
                existing_nullable=False,
            )


def downgrade() -> None:
    with op.batch_alter_table(TABLE_NAME, schema=None) as batch_op:
        batch_op.drop_column("favorite_updated_at")
        batch_op.drop_column("rating_updated_at")
        batch_op.drop_column("is_favorite")
        batch_op.drop_column("rating")
