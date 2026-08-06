"""multi-user unified storage and authentication

Revision ID: 20260713_0002
Revises: 20260708_0001
Create Date: 2026-07-13
"""

from alembic import op
import sqlalchemy as sa


revision = "20260713_0002"
down_revision = "20260708_0001"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("username", sa.String(50), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False, server_default=""),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.String(40), nullable=True),
        sa.Column("last_login_at", sa.String(40), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.execute(
        "INSERT INTO users (id, username, password_hash, role, is_active, failed_login_count, created_at, updated_at) "
        "VALUES ('local', 'local', '', 'admin', 1, 0, '2026-07-13T00:00:00Z', '2026-07-13T00:00:00Z')"
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("csrf_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.String(40), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("last_seen_at", sa.String(40), nullable=False),
        sa.Column("revoked_at", sa.String(40), nullable=True),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=True)
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "user_preferences",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(64), nullable=False, unique=True),
        sa.Column("preferences_json", sa.JSON(), nullable=False),
        *_timestamps(),
    )
    op.execute(
        "INSERT INTO user_preferences (user_id, preferences_json, created_at, updated_at) "
        "VALUES ('local', '{}', '2026-07-13T00:00:00Z', '2026-07-13T00:00:00Z')"
    )

    _rebuild_calendar_tables()
    _create_memory_tables()
    _create_personal_extension_tables()


def _rebuild_calendar_tables() -> None:
    for table in ("event_types", "todos", "events", "planning_runs"):
        op.rename_table(table, f"legacy_{table}")

    op.create_table(
        "event_types",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("color", sa.String(32), nullable=False),
        sa.Column("applies_to", sa.String(16), nullable=False, server_default="both"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "id", name="uq_event_types_user_external"),
    )
    op.create_table(
        "todos",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
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
        *_timestamps(),
        sa.Column("completed_at", sa.String(40), nullable=True),
        sa.UniqueConstraint("user_id", "id", name="uq_todos_user_external"),
    )
    op.create_table(
        "events",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
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
        *_timestamps(),
        sa.UniqueConstraint("user_id", "id", name="uq_events_user_external"),
    )
    op.create_table(
        "planning_runs",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("input_json", sa.JSON(), nullable=False),
        sa.Column("output_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "id", name="uq_planning_runs_user_external"),
    )

    columns = {
        "event_types": "id, user_id, label, color, applies_to, is_archived, created_at, updated_at",
        "todos": "id, user_id, title, notes, status, event_type_id, due_date, linked_event_id, long_project_json, eta_minutes, energy_needed, priority, created_at, updated_at, completed_at",
        "events": "id, user_id, title, description, display_details, start_at, end_at, all_day, color, event_type_id, linked_todo_id, recurrence_rule_json, master_id, exception_for, exception_date, deleted_occurrences_json, sync_status, created_at, updated_at",
        "planning_runs": "id, user_id, summary, input_json, output_json, created_at",
    }
    for table, selected in columns.items():
        op.execute(f"INSERT INTO {table} ({selected}) SELECT {selected} FROM legacy_{table}")
        op.drop_table(f"legacy_{table}")

    op.create_index("idx_todos_user_status_due", "todos", ["user_id", "status", "due_date"])
    op.create_index("idx_events_user_start_end", "events", ["user_id", "start_at", "end_at"])
    op.create_index("idx_event_types_user_archived", "event_types", ["user_id", "is_archived"])


def _create_memory_tables() -> None:
    op.create_table(
        "goals",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("goal_id", sa.String(64), nullable=False), sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False), sa.Column("metadata_json", sa.JSON(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "goal_id", name="uq_goals_user_external"),
    )
    op.create_table(
        "projects",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("goal_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False), sa.Column("metadata_json", sa.JSON(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "project_id", name="uq_projects_user_external"),
    )
    op.create_table(
        "milestones",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("milestone_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("due_date", sa.String(10), nullable=True), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "milestone_id", name="uq_milestones_user_external"),
    )
    op.create_table(
        "action_items",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("action_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("milestone_id", sa.String(64), nullable=True), sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False), sa.Column("due_date", sa.String(10), nullable=True),
        sa.Column("status", sa.String(24), nullable=False), sa.Column("metadata_json", sa.JSON(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "action_id", name="uq_actions_user_external"),
    )
    op.create_table(
        "progress_logs",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("progress_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("goal_id", sa.String(64), nullable=True), sa.Column("action_id", sa.String(64), nullable=True),
        sa.Column("log_type", sa.String(24), nullable=False), sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("details", sa.Text(), nullable=False), sa.Column("metadata_json", sa.JSON(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "progress_id", name="uq_progress_user_external"),
    )
    op.create_table(
        "tool_runs",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("tool_run_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("goal_id", sa.String(64), nullable=True), sa.Column("tool_name", sa.String(120), nullable=False),
        sa.Column("intent", sa.Text(), nullable=False), sa.Column("input_summary", sa.Text(), nullable=False),
        sa.Column("output_summary", sa.Text(), nullable=False), sa.Column("status", sa.String(32), nullable=False),
        sa.Column("input_json", sa.JSON(), nullable=False), sa.Column("output_json", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "tool_run_id", name="uq_tool_runs_user_external"),
    )


def _create_personal_extension_tables() -> None:
    op.create_table(
        "fridge_items",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("item_name", sa.String(200), nullable=False),
        sa.Column("normalized_name", sa.String(200), nullable=False), sa.Column("category", sa.String(80), nullable=False, server_default="unknown"),
        sa.Column("storage_type", sa.String(24), nullable=False, server_default="unknown"), sa.Column("purchase_date", sa.String(10), nullable=False, server_default=""),
        sa.Column("estimated_expiration_date", sa.String(10), nullable=True), sa.Column("estimated_shelf_life_days", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"), sa.Column("source", sa.String(80), nullable=False, server_default="manual"),
        sa.Column("receipt_id", sa.String(64), nullable=True), sa.Column("quantity", sa.String(80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "item_id", name="uq_fridge_items_user_external"),
    )
    op.create_table(
        "tool_presets",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("preset_id", sa.String(80), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False), sa.Column("preset_json", sa.JSON(), nullable=False), *_timestamps(),
        sa.UniqueConstraint("user_id", "preset_id", name="uq_tool_presets_user_external"),
    )
    op.create_table(
        "migration_imports",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True), sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("source", sa.String(120), nullable=False), sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("report_json", sa.JSON(), nullable=False), sa.Column("imported_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("user_id", "source", "checksum", name="uq_migration_import_user_source_checksum"),
    )


def downgrade() -> None:
    raise RuntimeError("20260713_0002 is intentionally irreversible; restore the pre-migration backup instead.")
