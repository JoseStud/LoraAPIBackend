"""Add rating and favourite tracking fields to delivery jobs.

Revision ID: e3c1f6a5c2b8
Revises: a1f4d5d0b6c7
Create Date: 2025-08-30 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "e3c1f6a5c2b8"
down_revision = "a1f4d5d0b6c7"
branch_labels = None
depends_on = None


def upgrade():
    """Add rating and favourite metadata columns."""
    with op.batch_alter_table("deliveryjob", schema=None) as batch_op:
        batch_op.add_column(sa.Column("rating", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "is_favorite",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(sa.Column("rating_updated_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("favorite_updated_at", sa.DateTime(), nullable=True))

    # Ensure the new boolean column defaults to False for existing rows.
    op.execute("UPDATE deliveryjob SET is_favorite = 0 WHERE is_favorite IS NULL")


def downgrade():
    """Remove rating and favourite metadata columns."""
    with op.batch_alter_table("deliveryjob", schema=None) as batch_op:
        batch_op.drop_column("favorite_updated_at")
        batch_op.drop_column("rating_updated_at")
        batch_op.drop_column("is_favorite")
        batch_op.drop_column("rating")
