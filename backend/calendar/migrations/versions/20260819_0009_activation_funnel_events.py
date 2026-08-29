"""Add a local, privacy-bounded Active Tool activation funnel ledger.

Revision ID: 20260819_0009
Revises: 20260719_0008
Create Date: 2026-08-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260819_0009"
down_revision = "20260719_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activation_funnel_events",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("journey_id", sa.String(80), nullable=False),
        sa.Column("thread_id", sa.String(64), nullable=True),
        sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("template_id", sa.String(80), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("event_name", sa.String(64), nullable=False),
        sa.Column("dedupe_key", sa.String(120), nullable=False),
        sa.Column("stage", sa.String(48), nullable=True),
        sa.Column("error_category", sa.String(48), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint(
            "user_id", "event_id", name="uq_activation_events_user_external"
        ),
        sa.UniqueConstraint(
            "user_id",
            "journey_id",
            "dedupe_key",
            name="uq_activation_events_user_journey_stage",
        ),
    )
    op.create_index(
        "ix_activation_events_user_journey",
        "activation_funnel_events",
        ["user_id", "journey_id"],
    )
    op.create_index(
        "ix_activation_events_user_name",
        "activation_funnel_events",
        ["user_id", "event_name"],
    )
    op.create_index(
        "ix_activation_events_user_template",
        "activation_funnel_events",
        ["user_id", "template_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_activation_events_user_template", table_name="activation_funnel_events")
    op.drop_index("ix_activation_events_user_name", table_name="activation_funnel_events")
    op.drop_index("ix_activation_events_user_journey", table_name="activation_funnel_events")
    op.drop_table("activation_funnel_events")
