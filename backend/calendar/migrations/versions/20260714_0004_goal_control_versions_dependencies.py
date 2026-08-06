"""goal control policies, versions, dependencies, and effort

Revision ID: 20260714_0004
Revises: 20260714_0003
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260714_0004"
down_revision = "20260714_0003"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.String(40), nullable=False), sa.Column("updated_at", sa.String(40), nullable=False)]


def upgrade() -> None:
    op.add_column("action_items", sa.Column("estimated_minutes", sa.Integer(), nullable=False, server_default="30"))
    op.add_column("action_items", sa.Column("priority", sa.String(16), nullable=False, server_default="medium"))
    op.add_column("action_items", sa.Column("energy_needed", sa.String(16), nullable=False, server_default="medium"))
    op.add_column("action_items", sa.Column("execution_tier", sa.String(16), nullable=False, server_default="standard"))

    op.create_table(
        "goal_control_policies",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("policy_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("weekly_capacity_minutes", sa.Integer(), nullable=False),
        sa.Column("buffer_percent", sa.Float(), nullable=False),
        sa.Column("active_tier", sa.String(16), nullable=False),
        sa.Column("ai_usage_mode", sa.String(16), nullable=True),
        sa.Column("available_days_json", sa.JSON(), nullable=False),
        sa.Column("replan_thresholds_json", sa.JSON(), nullable=False),
        sa.Column("stop_rules_json", sa.JSON(), nullable=False),
        sa.Column("planning_brief_json", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "policy_id", name="uq_goal_policies_user_external"),
        sa.UniqueConstraint("user_id", "project_id", name="uq_goal_policies_user_project"),
    )
    op.create_index("ix_goal_policies_user", "goal_control_policies", ["user_id"])

    op.create_table(
        "plan_versions",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("version_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False),
        sa.Column("milestone_id", sa.String(64), nullable=True),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("diff_json", sa.JSON(), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "version_id", name="uq_plan_versions_user_external"),
        sa.UniqueConstraint("user_id", "project_id", "version_number", name="uq_plan_versions_user_project_number"),
    )
    op.create_index("ix_plan_versions_user_project", "plan_versions", ["user_id", "project_id"])

    op.create_table(
        "plan_dependencies",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dependency_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("predecessor_action_id", sa.String(64), nullable=False),
        sa.Column("successor_action_id", sa.String(64), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "dependency_id", name="uq_plan_dependencies_user_external"),
    )
    op.create_index("ix_plan_dependencies_user_project", "plan_dependencies", ["user_id", "project_id"])

    op.create_table(
        "effort_entries",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("effort_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("action_id", sa.String(64), nullable=True),
        sa.Column("occurred_on", sa.String(10), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "effort_id", name="uq_effort_entries_user_external"),
    )
    op.create_index("ix_effort_entries_user_project_date", "effort_entries", ["user_id", "project_id", "occurred_on"])

    op.create_table(
        "action_event_links",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("link_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("action_id", sa.String(64), nullable=False),
        sa.Column("event_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "link_id", name="uq_action_event_links_user_external"),
    )
    op.create_index("ix_action_event_links_user_project", "action_event_links", ["user_id", "project_id"])


def downgrade() -> None:
    op.drop_table("action_event_links")
    op.drop_table("effort_entries")
    op.drop_table("plan_dependencies")
    op.drop_table("plan_versions")
    op.drop_table("goal_control_policies")
    op.drop_column("action_items", "execution_tier")
    op.drop_column("action_items", "energy_needed")
    op.drop_column("action_items", "priority")
    op.drop_column("action_items", "estimated_minutes")
