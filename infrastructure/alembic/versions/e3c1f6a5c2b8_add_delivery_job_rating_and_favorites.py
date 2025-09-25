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
    """Add rating and favourite metadata columns (idempotent)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns("deliveryjob")}

    with op.batch_alter_table("deliveryjob", schema=None) as batch_op:
        if "rating" not in existing:
            batch_op.add_column(sa.Column("rating", sa.Integer(), nullable=True))

        added_favorite = False
        if "is_favorite" not in existing:
            batch_op.add_column(
                sa.Column(
                    "is_favorite",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )
            added_favorite = True

        if "rating_updated_at" not in existing:
            batch_op.add_column(
                sa.Column("rating_updated_at", sa.DateTime(), nullable=True)
            )

        if "favorite_updated_at" not in existing:
            batch_op.add_column(
                sa.Column("favorite_updated_at", sa.DateTime(), nullable=True)
            )

        # Remove sticky default to match model behaviour
        if added_favorite:
            batch_op.alter_column(
                "is_favorite",
                server_default=None,
                existing_type=sa.Boolean(),
                existing_nullable=False,
            )

    # Backfill nulls only if the column exists
    if "is_favorite" in existing:
        dialect = bind.dialect.name if bind is not None else ""
        if dialect == "postgresql":
            op.execute("UPDATE deliveryjob SET is_favorite = false WHERE is_favorite IS NULL")
        else:
            op.execute("UPDATE deliveryjob SET is_favorite = 0 WHERE is_favorite IS NULL")


def downgrade():
    """Remove rating and favourite metadata columns."""
    with op.batch_alter_table("deliveryjob", schema=None) as batch_op:
        batch_op.drop_column("favorite_updated_at")
        batch_op.drop_column("rating_updated_at")
        batch_op.drop_column("is_favorite")
        batch_op.drop_column("rating")
