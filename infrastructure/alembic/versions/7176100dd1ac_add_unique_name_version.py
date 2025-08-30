"""add unique index on adapter (name, version)

Revision ID: 7176100dd1ac
Revises: 5f681a8fe826
Create Date: 2025-08-28 00:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '7176100dd1ac'
down_revision = '5f681a8fe826'
branch_labels = None
depends_on = None


def upgrade():
    # Create a unique index on adapter(name, version)
    op.create_index('ux_adapter_name_version', 'adapter', ['name', 'version'], unique=True)


def downgrade():
    op.drop_index('ux_adapter_name_version', table_name='adapter')
