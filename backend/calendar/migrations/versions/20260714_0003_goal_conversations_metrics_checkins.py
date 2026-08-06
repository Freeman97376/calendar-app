"""goal conversations, metrics, check-ins, and plan proposals

Revision ID: 20260714_0003
Revises: 20260713_0002
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260714_0003"
down_revision = "20260713_0002"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "conversation_threads",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("thread_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("goal_id", sa.String(64), nullable=True),
        sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("template_id", sa.String(80), nullable=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("rolling_summary", sa.Text(), nullable=False),
        sa.Column("summary_through_message_id", sa.String(64), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "thread_id", name="uq_threads_user_external"),
    )
    op.create_index("ix_threads_user", "conversation_threads", ["user_id"])
    op.create_index("ix_threads_user_project", "conversation_threads", ["user_id", "project_id"])

    op.create_table(
        "conversation_messages",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("message_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("thread_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("structured_json", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "message_id", name="uq_messages_user_external"),
    )
    op.create_index("ix_messages_user_thread", "conversation_messages", ["user_id", "thread_id"])

    op.create_table(
        "metric_definitions",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("metric_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("value_type", sa.String(24), nullable=False),
        sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("ideal_value", sa.Float(), nullable=True),
        sa.Column("acceptable_min", sa.Float(), nullable=True),
        sa.Column("acceptable_max", sa.Float(), nullable=True),
        sa.Column("safety_min", sa.Float(), nullable=True),
        sa.Column("safety_max", sa.Float(), nullable=True),
        sa.Column("target_date", sa.String(10), nullable=True),
        sa.Column("cadence", sa.String(24), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "metric_id", name="uq_metrics_user_external"),
    )
    op.create_index("ix_metrics_user_project", "metric_definitions", ["user_id", "project_id"])

    op.create_table(
        "metric_entries",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("entry_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("metric_id", sa.String(64), nullable=False),
        sa.Column("observed_at", sa.String(40), nullable=False),
        sa.Column("numeric_value", sa.Float(), nullable=True),
        sa.Column("text_value", sa.String(200), nullable=True),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("is_anomaly", sa.Boolean(), nullable=False),
        sa.Column("anomaly_reason", sa.String(300), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "entry_id", name="uq_metric_entries_user_external"),
    )
    op.create_index("ix_metric_entries_user_metric_time", "metric_entries", ["user_id", "metric_id", "observed_at"])

    op.create_table(
        "check_in_schedules",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("schedule_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("local_time", sa.String(5), nullable=False),
        sa.Column("timezone", sa.String(80), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("review_interval_days", sa.Integer(), nullable=False),
        sa.Column("last_check_in_at", sa.String(40), nullable=True),
        sa.Column("last_review_at", sa.String(40), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "schedule_id", name="uq_checkin_schedules_user_external"),
        sa.UniqueConstraint("user_id", "project_id", name="uq_checkin_schedules_user_project"),
    )
    op.create_index("ix_checkin_schedules_user", "check_in_schedules", ["user_id"])

    op.create_table(
        "check_ins",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("check_in_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("thread_id", sa.String(64), nullable=True),
        sa.Column("period_start", sa.String(10), nullable=False),
        sa.Column("period_end", sa.String(10), nullable=False),
        sa.Column("due_at", sa.String(40), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("includes_review", sa.Boolean(), nullable=False),
        sa.Column("questions_json", sa.JSON(), nullable=False),
        sa.Column("answers_json", sa.JSON(), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("answered_at", sa.String(40), nullable=True),
        sa.Column("skipped_at", sa.String(40), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "check_in_id", name="uq_checkins_user_external"),
    )
    op.create_index("ix_checkins_user_project_status", "check_ins", ["user_id", "project_id", "status"])

    op.create_table(
        "plan_change_proposals",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("proposal_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("thread_id", sa.String(64), nullable=True),
        sa.Column("proposal_type", sa.String(24), nullable=False),
        sa.Column("base_version_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("proposal_json", sa.JSON(), nullable=False),
        sa.Column("diff_json", sa.JSON(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("resolved_at", sa.String(40), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "proposal_id", name="uq_plan_proposals_user_external"),
    )
    op.create_index("ix_plan_proposals_user_project", "plan_change_proposals", ["user_id", "project_id"])


def downgrade() -> None:
    op.drop_table("plan_change_proposals")
    op.drop_table("check_ins")
    op.drop_table("check_in_schedules")
    op.drop_table("metric_entries")
    op.drop_table("metric_definitions")
    op.drop_table("conversation_messages")
    op.drop_table("conversation_threads")
