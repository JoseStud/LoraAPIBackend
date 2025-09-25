"""add complete civitai fields.

Revision ID: d16f3e1df8bd
Revises: 7176100dd1ac
Create Date: 2025-08-28 20:47:47.154281
"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "d16f3e1df8bd"
down_revision = "7176100dd1ac"
branch_labels = None
depends_on = None


def upgrade():
    """Add adapter civitai fields idempotently and fix types."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns("adapter")}
    dialect = bind.dialect.name if bind is not None else ""

    def _bool_false_default():
        return sa.false() if dialect == "postgresql" else sa.text("0")

    with op.batch_alter_table("adapter", schema=None) as batch_op:
        if "canonical_version_name" not in existing:
            batch_op.add_column(
                sa.Column(
                    "canonical_version_name",
                    sqlmodel.sql.sqltypes.AutoString(),
                    nullable=True,
                )
            )
        if "description" not in existing:
            batch_op.add_column(
                sa.Column(
                    "description", sqlmodel.sql.sqltypes.AutoString(), nullable=True
                )
            )
        if "author_username" not in existing:
            batch_op.add_column(
                sa.Column(
                    "author_username", sqlmodel.sql.sqltypes.AutoString(), nullable=True
                )
            )
        if "visibility" not in existing:
            batch_op.add_column(
                sa.Column(
                    "visibility",
                    sqlmodel.sql.sqltypes.AutoString(),
                    nullable=False,
                    server_default="Public",
                )
            )
        if "published_at" not in existing:
            batch_op.add_column(sa.Column("published_at", sa.DateTime(), nullable=True))
        if "trained_words" not in existing:
            batch_op.add_column(sa.Column("trained_words", sa.JSON(), nullable=True))
        if "triggers" not in existing:
            batch_op.add_column(sa.Column("triggers", sa.JSON(), nullable=True))
        if "primary_file_name" not in existing:
            batch_op.add_column(
                sa.Column(
                    "primary_file_name",
                    sqlmodel.sql.sqltypes.AutoString(),
                    nullable=True,
                )
            )
        if "primary_file_size_kb" not in existing:
            batch_op.add_column(
                sa.Column("primary_file_size_kb", sa.Integer(), nullable=True)
            )
        if "primary_file_sha256" not in existing:
            batch_op.add_column(
                sa.Column(
                    "primary_file_sha256",
                    sqlmodel.sql.sqltypes.AutoString(),
                    nullable=True,
                )
            )
        if "primary_file_download_url" not in existing:
            batch_op.add_column(
                sa.Column(
                    "primary_file_download_url",
                    sqlmodel.sql.sqltypes.AutoString(),
                    nullable=True,
                )
            )
        if "primary_file_local_path" not in existing:
            batch_op.add_column(
                sa.Column(
                    "primary_file_local_path",
                    sqlmodel.sql.sqltypes.AutoString(),
                    nullable=True,
                )
            )
        added_supports_generation = False
        if "supports_generation" not in existing:
            batch_op.add_column(
                sa.Column(
                    "supports_generation",
                    sa.Boolean(),
                    nullable=False,
                    server_default=_bool_false_default(),
                )
            )
            added_supports_generation = True
        if "sd_version" not in existing:
            batch_op.add_column(
                sa.Column("sd_version", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
            )
        if "nsfw_level" not in existing:
            batch_op.add_column(
                sa.Column("nsfw_level", sa.Integer(), nullable=False, server_default="0")
            )
        if "activation_text" not in existing:
            batch_op.add_column(
                sa.Column(
                    "activation_text", sqlmodel.sql.sqltypes.AutoString(), nullable=True
                )
            )
        if "stats" not in existing:
            batch_op.add_column(sa.Column("stats", sa.JSON(), nullable=True))
        if "extra" not in existing:
            batch_op.add_column(sa.Column("extra", sa.JSON(), nullable=True))

        # Remove sticky default
        if added_supports_generation:
            batch_op.alter_column(
                "supports_generation",
                server_default=None,
                existing_type=sa.Boolean(),
                existing_nullable=False,
            )

        # Ensure tags is JSON if it isn't already
        cols = {c["name"]: c for c in inspector.get_columns("adapter")}
        tags_col = cols.get("tags")
        if tags_col is not None and not isinstance(tags_col["type"], sa.JSON):
            batch_op.alter_column(
                "tags",
                existing_type=tags_col["type"],
                type_=sa.JSON(),
                existing_nullable=True,
            )


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("adapter", schema=None) as batch_op:
        batch_op.alter_column(
            "tags", existing_type=sa.JSON(), type_=sa.VARCHAR(), existing_nullable=True
        )
        batch_op.drop_column("extra")
        batch_op.drop_column("stats")
        batch_op.drop_column("activation_text")
        batch_op.drop_column("nsfw_level")
        batch_op.drop_column("sd_version")
        batch_op.drop_column("supports_generation")
        batch_op.drop_column("primary_file_local_path")
        batch_op.drop_column("primary_file_download_url")
        batch_op.drop_column("primary_file_sha256")
        batch_op.drop_column("primary_file_size_kb")
        batch_op.drop_column("primary_file_name")
        batch_op.drop_column("triggers")
        batch_op.drop_column("trained_words")
        batch_op.drop_column("published_at")
        batch_op.drop_column("visibility")
        batch_op.drop_column("author_username")
        batch_op.drop_column("description")
        batch_op.drop_column("canonical_version_name")

    # ### end Alembic commands ###
