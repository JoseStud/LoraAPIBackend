"""Initial database schema."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlmodel.sql.sqltypes import AutoString

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "adapter",
        sa.Column("id", AutoString(), nullable=False),
        sa.Column("name", AutoString(), nullable=False),
        sa.Column("version", AutoString(), nullable=True),
        sa.Column("canonical_version_name", AutoString(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("author_username", AutoString(), nullable=True),
        sa.Column("visibility", AutoString(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("trained_words", sa.JSON(), nullable=False),
        sa.Column("triggers", sa.JSON(), nullable=False),
        sa.Column("file_path", AutoString(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=True),
        sa.Column("archetype", AutoString(), nullable=True),
        sa.Column("archetype_confidence", sa.Float(), nullable=True),
        sa.Column("primary_file_name", AutoString(), nullable=True),
        sa.Column("primary_file_size_kb", sa.Integer(), nullable=True),
        sa.Column("primary_file_sha256", AutoString(), nullable=True),
        sa.Column("primary_file_download_url", AutoString(), nullable=True),
        sa.Column("primary_file_local_path", AutoString(), nullable=True),
        sa.Column("supports_generation", sa.Boolean(), nullable=False),
        sa.Column("sd_version", AutoString(), nullable=True),
        sa.Column("nsfw_level", sa.Integer(), nullable=False),
        sa.Column("activation_text", sa.Text(), nullable=True),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("json_file_path", AutoString(), nullable=True),
        sa.Column("json_file_mtime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("json_file_size", sa.Integer(), nullable=True),
        sa.Column("last_ingested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ux_adapter_name_version",
        "adapter",
        ["name", "version"],
        unique=True,
    )
    op.create_index("idx_adapter_active", "adapter", ["active"])
    op.create_index("idx_adapter_json_file_path", "adapter", ["json_file_path"])
    op.create_index("idx_adapter_created_at", "adapter", ["created_at"])
    op.create_index("idx_adapter_updated_at", "adapter", ["updated_at"])
    op.create_index("idx_adapter_last_ingested_at", "adapter", ["last_ingested_at"])

    op.create_table(
        "deliveryjob",
        sa.Column("id", AutoString(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("mode", AutoString(), nullable=False),
        sa.Column("params", sa.Text(), nullable=True),
        sa.Column("status", AutoString(), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column("rating_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("favorite_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "recommendationsession",
        sa.Column("id", AutoString(), nullable=False),
        sa.Column("context_prompt", sa.Text(), nullable=True),
        sa.Column("active_loras", sa.JSON(), nullable=False),
        sa.Column("target_lora_id", AutoString(), nullable=True),
        sa.Column("recommendation_type", AutoString(), nullable=False),
        sa.Column("recommendations", sa.JSON(), nullable=False),
        sa.Column("user_feedback", sa.JSON(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "userpreference",
        sa.Column("id", AutoString(), nullable=False),
        sa.Column("preference_type", AutoString(), nullable=False),
        sa.Column("preference_value", AutoString(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("learned_from", AutoString(), nullable=False),
        sa.Column("evidence_count", sa.Integer(), nullable=False),
        sa.Column("last_evidence_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_userpreference_type_value",
        "userpreference",
        ["preference_type", "preference_value"],
    )

    op.create_table(
        "loraembedding",
        sa.Column("adapter_id", AutoString(), nullable=False),
        sa.Column("semantic_embedding", sa.LargeBinary(), nullable=True),
        sa.Column("artistic_embedding", sa.LargeBinary(), nullable=True),
        sa.Column("technical_embedding", sa.LargeBinary(), nullable=True),
        sa.Column("extracted_keywords", sa.JSON(), nullable=False),
        sa.Column("keyword_scores", sa.JSON(), nullable=False),
        sa.Column("predicted_style", AutoString(), nullable=True),
        sa.Column("style_confidence", sa.Float(), nullable=True),
        sa.Column("sentiment_label", AutoString(), nullable=True),
        sa.Column("sentiment_score", sa.Float(), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("popularity_score", sa.Float(), nullable=True),
        sa.Column("recency_score", sa.Float(), nullable=True),
        sa.Column("compatibility_score", sa.Float(), nullable=True),
        sa.Column("last_computed", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["adapter_id"], ["adapter.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("adapter_id"),
    )

    op.create_table(
        "recommendationfeedback",
        sa.Column("id", AutoString(), nullable=False),
        sa.Column("session_id", AutoString(), nullable=False),
        sa.Column("recommended_lora_id", AutoString(), nullable=False),
        sa.Column("feedback_type", AutoString(), nullable=False),
        sa.Column("feedback_reason", sa.Text(), nullable=True),
        sa.Column("implicit_signal", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["recommended_lora_id"], ["adapter.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["recommendationsession.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("recommendationfeedback")
    op.drop_table("loraembedding")
    op.drop_index("ix_userpreference_type_value", table_name="userpreference")
    op.drop_table("userpreference")
    op.drop_table("recommendationsession")
    op.drop_table("deliveryjob")
    op.drop_index("idx_adapter_last_ingested_at", table_name="adapter")
    op.drop_index("idx_adapter_updated_at", table_name="adapter")
    op.drop_index("idx_adapter_created_at", table_name="adapter")
    op.drop_index("idx_adapter_json_file_path", table_name="adapter")
    op.drop_index("idx_adapter_active", table_name="adapter")
    op.drop_index("ux_adapter_name_version", table_name="adapter")
    op.drop_table("adapter")
