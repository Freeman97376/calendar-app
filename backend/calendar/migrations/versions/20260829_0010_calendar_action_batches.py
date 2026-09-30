"""Add idempotent calendar action batch records.

Revision ID: 20260829_0010
Revises: 20260819_0009
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260829_0010"
down_revision = "20260819_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_action_batches",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("batch_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("source", sa.String(48), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("tool_run_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "batch_id", name="uq_calendar_batches_user_external"),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_calendar_batches_user_idempotency"),
        sa.ForeignKeyConstraint(
            ["user_id", "project_id"],
            ["projects.user_id", "projects.project_id"],
            name="fk_calendar_batches_project",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "tool_run_id"],
            ["tool_runs.user_id", "tool_runs.tool_run_id"],
            name="fk_calendar_batches_tool_run",
        ),
    )
    op.create_index(
        "ix_calendar_batches_user_created",
        "calendar_action_batches",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_batches_user_created", table_name="calendar_action_batches")
    op.drop_table("calendar_action_batches")
