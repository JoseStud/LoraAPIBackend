"""Merge heads after adding trigger columns.

Revision ID: m1a2b3c4d5e6
Revises: 952b85546fed, f0a1b2c3d4e5
Create Date: 2025-09-25 00:10:00.000000
"""

from alembic import op  # noqa: F401  # imported for Alembic context

# revision identifiers, used by Alembic.
revision = "m1a2b3c4d5e6"
down_revision = ("952b85546fed", "f0a1b2c3d4e5")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge revision; no operations are required.
    pass


def downgrade() -> None:
    # Downgrading a merge revision typically does nothing.
    pass

