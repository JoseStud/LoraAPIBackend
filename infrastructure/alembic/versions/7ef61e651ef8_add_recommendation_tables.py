"""Add recommendation-related tables.

Revision ID: 7ef61e651ef8
Revises: 7176100dd1ac
Create Date: 2025-08-29 00:00:00.000000
"""

from typing import Set

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "7ef61e651ef8"
down_revision = "7176100dd1ac"
branch_labels = None
depends_on = None


def _existing_tables() -> Set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    existing = _existing_tables()

    if "recommendationsession" not in existing:
        op.create_table(
            "recommendationsession",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("context_prompt", sa.Text(), nullable=True),
            sa.Column("active_loras", sa.JSON(), nullable=False),
            sa.Column("target_lora_id", sa.String(length=255), nullable=True),
            sa.Column("recommendation_type", sa.String(length=255), nullable=False),
            sa.Column("recommendations", sa.JSON(), nullable=False),
            sa.Column("user_feedback", sa.JSON(), nullable=True),
            sa.Column("generated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if "userpreference" not in existing:
        op.create_table(
            "userpreference",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("preference_type", sa.String(length=255), nullable=False),
            sa.Column("preference_value", sa.String(length=255), nullable=False),
            sa.Column("confidence", sa.Float(), nullable=False),
            sa.Column("learned_from", sa.String(length=255), nullable=False),
            sa.Column("evidence_count", sa.Integer(), nullable=False),
            sa.Column("last_evidence_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        # Index is intentionally created in a later revision (a1f4d5d0b6c7)

    if "loraembedding" not in existing:
        op.create_table(
            "loraembedding",
            sa.Column("adapter_id", sa.String(length=255), nullable=False),
            sa.Column("semantic_embedding", sa.LargeBinary(), nullable=True),
            sa.Column("artistic_embedding", sa.LargeBinary(), nullable=True),
            sa.Column("technical_embedding", sa.LargeBinary(), nullable=True),
            sa.Column("extracted_keywords", sa.JSON(), nullable=False),
            sa.Column("keyword_scores", sa.JSON(), nullable=False),
            sa.Column("predicted_style", sa.String(length=255), nullable=True),
            sa.Column("style_confidence", sa.Float(), nullable=True),
            sa.Column("sentiment_label", sa.String(length=255), nullable=True),
            sa.Column("sentiment_score", sa.Float(), nullable=True),
            sa.Column("quality_score", sa.Float(), nullable=True),
            sa.Column("popularity_score", sa.Float(), nullable=True),
            sa.Column("recency_score", sa.Float(), nullable=True),
            sa.Column("compatibility_score", sa.Float(), nullable=True),
            sa.Column("last_computed", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["adapter_id"], ["adapter.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("adapter_id"),
        )

    if "recommendationfeedback" not in existing:
        op.create_table(
            "recommendationfeedback",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("session_id", sa.String(length=255), nullable=False),
            sa.Column("recommended_lora_id", sa.String(length=255), nullable=False),
            sa.Column("feedback_type", sa.String(length=255), nullable=False),
            sa.Column("feedback_reason", sa.Text(), nullable=True),
            sa.Column("implicit_signal", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["recommended_lora_id"], ["adapter.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["session_id"], ["recommendationsession.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    # Drop recommendation-related tables if they exist
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "recommendationfeedback" in tables:
        op.drop_table("recommendationfeedback")
    if "loraembedding" in tables:
        op.drop_table("loraembedding")
    if "userpreference" in tables:
        op.drop_table("userpreference")
    if "recommendationsession" in tables:
        op.drop_table("recommendationsession")

