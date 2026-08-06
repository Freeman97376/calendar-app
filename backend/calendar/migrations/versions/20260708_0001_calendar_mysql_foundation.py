"""calendar mysql foundation

Revision ID: 20260708_0001
Revises:
Create Date: 2026-07-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260708_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, server_default="local"),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("color", sa.String(32), nullable=False),
        sa.Column("applies_to", sa.String(16), nullable=False, server_default="both"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "todos",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, server_default="local"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="todo"),
        sa.Column("event_type_id", sa.String(64), nullable=False, server_default="general"),
        sa.Column("due_date", sa.String(10), nullable=True),
        sa.Column("linked_event_id", sa.String(64), nullable=True),
        sa.Column("long_project_json", sa.JSON(), nullable=True),
        sa.Column("eta_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("energy_needed", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("priority", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("completed_at", sa.String(40), nullable=True),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, server_default="local"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("display_details", sa.Text(), nullable=True),
        sa.Column("start_at", sa.String(40), nullable=False),
        sa.Column("end_at", sa.String(40), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("color", sa.String(32), nullable=True),
        sa.Column("event_type_id", sa.String(64), nullable=False, server_default="general"),
        sa.Column("linked_todo_id", sa.String(64), nullable=True),
        sa.Column("recurrence_rule_json", sa.JSON(), nullable=True),
        sa.Column("master_id", sa.String(64), nullable=True),
        sa.Column("exception_for", sa.String(64), nullable=True),
        sa.Column("exception_date", sa.String(10), nullable=True),
        sa.Column("deleted_occurrences_json", sa.JSON(), nullable=True),
        sa.Column("sync_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "planning_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, server_default="local"),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("input_json", sa.JSON(), nullable=False),
        sa.Column("output_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_index("idx_todos_user_status_due", "todos", ["user_id", "status", "due_date"])
    op.create_index("idx_todos_user_type", "todos", ["user_id", "event_type_id"])
    op.create_index("idx_todos_linked_event", "todos", ["linked_event_id"])
    op.create_index("idx_events_user_start_end", "events", ["user_id", "start_at", "end_at"])
    op.create_index("idx_events_user_type", "events", ["user_id", "event_type_id"])
    op.create_index("idx_events_linked_todo", "events", ["linked_todo_id"])
    op.create_index("idx_event_types_user_archived", "event_types", ["user_id", "is_archived"])


def downgrade() -> None:
    op.drop_table("planning_runs")
    op.drop_table("events")
    op.drop_table("todos")
    op.drop_table("event_types")
