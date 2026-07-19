"""AI usage accounting and budgets

Revision ID: 20260714_0005
Revises: 20260714_0004
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260714_0005"
down_revision = "20260714_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_events",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("usage_event_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("thread_id", sa.String(64), nullable=True),
        sa.Column("operation", sa.String(32), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("usage_mode", sa.String(16), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("estimated", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "usage_event_id", name="uq_ai_usage_user_external"),
    )
    op.create_index("ix_ai_usage_user_created", "ai_usage_events", ["user_id", "created_at"])

    op.create_table(
        "ai_usage_monthly",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("month_key", sa.String(7), nullable=False),
        sa.Column("routine_input_tokens", sa.Integer(), nullable=False),
        sa.Column("routine_output_tokens", sa.Integer(), nullable=False),
        sa.Column("planning_input_tokens", sa.Integer(), nullable=False),
        sa.Column("planning_output_tokens", sa.Integer(), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "month_key", name="uq_ai_usage_user_month"),
    )
    op.create_index("ix_ai_usage_monthly_user", "ai_usage_monthly", ["user_id"])


def downgrade() -> None:
    op.drop_table("ai_usage_monthly")
    op.drop_table("ai_usage_events")
