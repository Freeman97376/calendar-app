"""Composite user-scoped business relationships.

Revision ID: 20260715_0007
Revises: 20260715_0006
Create Date: 2026-07-15
"""

from alembic import op


revision = "20260715_0007"
down_revision = "20260715_0006"
branch_labels = None
depends_on = None


FOREIGN_KEYS = {
    "projects": [("fk_projects_goal", "goals", ["user_id", "goal_id"], ["user_id", "goal_id"], "CASCADE")],
    "milestones": [("fk_milestones_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE")],
    "action_items": [
        ("fk_actions_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_actions_milestone", "milestones", ["user_id", "milestone_id"], ["user_id", "milestone_id"], None),
    ],
    "progress_logs": [
        ("fk_progress_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_progress_goal", "goals", ["user_id", "goal_id"], ["user_id", "goal_id"], None),
        ("fk_progress_action", "action_items", ["user_id", "action_id"], ["user_id", "action_id"], None),
    ],
    "tool_runs": [
        ("fk_tool_runs_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], None),
        ("fk_tool_runs_goal", "goals", ["user_id", "goal_id"], ["user_id", "goal_id"], None),
    ],
    "conversation_threads": [
        ("fk_threads_goal", "goals", ["user_id", "goal_id"], ["user_id", "goal_id"], None),
        ("fk_threads_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], None),
    ],
    "conversation_messages": [("fk_messages_thread", "conversation_threads", ["user_id", "thread_id"], ["user_id", "thread_id"], "CASCADE")],
    "metric_definitions": [("fk_metrics_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE")],
    "metric_entries": [
        ("fk_metric_entries_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_metric_entries_metric", "metric_definitions", ["user_id", "metric_id"], ["user_id", "metric_id"], "CASCADE"),
    ],
    "check_in_schedules": [("fk_checkin_schedules_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE")],
    "check_ins": [
        ("fk_checkins_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_checkins_thread", "conversation_threads", ["user_id", "thread_id"], ["user_id", "thread_id"], None),
    ],
    "plan_change_proposals": [
        ("fk_proposals_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], None),
        ("fk_proposals_thread", "conversation_threads", ["user_id", "thread_id"], ["user_id", "thread_id"], None),
    ],
    "goal_control_policies": [("fk_policies_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE")],
    "plan_versions": [("fk_versions_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE")],
    "plan_dependencies": [
        ("fk_dependencies_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_dependencies_predecessor", "action_items", ["user_id", "predecessor_action_id"], ["user_id", "action_id"], "CASCADE"),
        ("fk_dependencies_successor", "action_items", ["user_id", "successor_action_id"], ["user_id", "action_id"], "CASCADE"),
    ],
    "effort_entries": [
        ("fk_effort_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_effort_action", "action_items", ["user_id", "action_id"], ["user_id", "action_id"], None),
    ],
    "action_event_links": [
        ("fk_action_links_project", "projects", ["user_id", "project_id"], ["user_id", "project_id"], "CASCADE"),
        ("fk_action_links_action", "action_items", ["user_id", "action_id"], ["user_id", "action_id"], "CASCADE"),
        ("fk_action_links_event", "events", ["user_id", "event_id"], ["user_id", "id"], "CASCADE"),
    ],
}


def upgrade() -> None:
    for table, constraints in FOREIGN_KEYS.items():
        with op.batch_alter_table(table) as batch:
            for name, target, local_columns, remote_columns, ondelete in constraints:
                batch.create_foreign_key(name, target, local_columns, remote_columns, ondelete=ondelete)


def downgrade() -> None:
    for table, constraints in reversed(list(FOREIGN_KEYS.items())):
        with op.batch_alter_table(table) as batch:
            for name, _target, _local_columns, _remote_columns, _ondelete in reversed(constraints):
                batch.drop_constraint(name, type_="foreignkey")
