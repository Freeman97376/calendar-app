from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKeyConstraint, Integer, JSON, String, Text, UniqueConstraint, create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import NullPool


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "calendar_app.sqlite3"
LOCAL_USER_ID = "local"
ALEMBIC_HEAD = "20260715_0007"


class Base(DeclarativeBase):
    pass


def database_url(
    configured: str | None = None,
    *,
    db_path: Path | str | None = None,
) -> str:
    if configured:
        return configured
    if db_path is not None:
        return f"sqlite:///{Path(db_path).resolve().as_posix()}"
    env_url = os.getenv("CALENDAR_DATABASE_URL", "").strip()
    if env_url:
        return env_url
    legacy_path = os.getenv("CALENDAR_DB_PATH", "").strip()
    path = Path(legacy_path) if legacy_path else DEFAULT_DB_PATH
    return f"sqlite:///{path.resolve().as_posix()}"


def create_database_engine(
    configured: str | None = None,
    *,
    db_path: Path | str | None = None,
) -> Engine:
    url = database_url(configured, db_path=db_path)
    kwargs: dict[str, Any] = {"future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url != "sqlite:///:memory:":
            kwargs["poolclass"] = NullPool
    else:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = 1800
    engine = create_engine(url, **kwargs)

    if engine.dialect.name == "sqlite":
        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


def initialize_schema(engine: Engine, *, stamp_migration_head: bool = False) -> None:
    Base.metadata.create_all(engine)
    if engine.dialect.name == "sqlite":
        _ensure_sqlite_forward_columns(engine)
    if stamp_migration_head:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
            connection.execute(text("DELETE FROM alembic_version"))
            connection.execute(text("INSERT INTO alembic_version (version_num) VALUES (:revision)"), {"revision": ALEMBIC_HEAD})


def _ensure_sqlite_forward_columns(engine: Engine) -> None:
    """Bring create_all-era desktop databases forward without touching legacy source files."""
    inspector = inspect(engine)
    if "action_items" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("action_items")}
    statements = {
        "estimated_minutes": "ALTER TABLE action_items ADD COLUMN estimated_minutes INTEGER NOT NULL DEFAULT 30",
        "priority": "ALTER TABLE action_items ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'medium'",
        "energy_needed": "ALTER TABLE action_items ADD COLUMN energy_needed VARCHAR(16) NOT NULL DEFAULT 'medium'",
        "execution_tier": "ALTER TABLE action_items ADD COLUMN execution_tier VARCHAR(16) NOT NULL DEFAULT 'standard'",
    }
    with engine.begin() as connection:
        for column, statement in statements.items():
            if column not in existing:
                connection.execute(text(statement))


def require_migration_head(engine: Engine, expected: str = ALEMBIC_HEAD) -> None:
    """Reject a production database that has not been migrated explicitly."""
    try:
        with engine.connect() as connection:
            current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
    except Exception as error:
        raise RuntimeError(
            "Database schema is not initialized. Run `alembic upgrade head` before starting the server."
        ) from error
    if current != expected:
        raise RuntimeError(
            f"Database schema is at {current or 'no revision'}; expected {expected}. "
            "Run `alembic upgrade head`."
        )


class UserRecord(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_login_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    csrf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    last_seen_at: Mapped[str] = mapped_column(String(40), nullable=False)
    revoked_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class AuthThrottleRecord(Base):
    __tablename__ = "auth_throttle_buckets"
    __table_args__ = (UniqueConstraint("scope", "key_hash", name="uq_auth_throttle_scope_key"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    window_started_at: Mapped[str] = mapped_column(String(40), nullable=False)
    blocked_until: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class DataIntegrityQuarantineRecord(Base):
    __tablename__ = "data_integrity_quarantine"

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_table: Mapped[str] = mapped_column(String(80), nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    quarantined_at: Mapped[str] = mapped_column(String(40), nullable=False)


class UserPreferenceRecord(Base):
    __tablename__ = "user_preferences"

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    preferences_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class EventTypeRecord(Base):
    __tablename__ = "event_types"
    __table_args__ = (UniqueConstraint("user_id", "id", name="uq_event_types_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(32), nullable=False)
    applies_to: Mapped[str] = mapped_column(String(16), nullable=False, default="both")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class TodoRecord(Base):
    __tablename__ = "todos"
    __table_args__ = (UniqueConstraint("user_id", "id", name="uq_todos_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="todo")
    event_type_id: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    linked_event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    long_project_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    eta_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    energy_needed: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class EventRecord(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("user_id", "id", name="uq_events_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_at: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    end_at: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event_type_id: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    linked_todo_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recurrence_rule_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    master_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    exception_for: Mapped[str | None] = mapped_column(String(64), nullable=True)
    exception_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    deleted_occurrences_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    sync_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class PlanningRunRecord(Base):
    __tablename__ = "planning_runs"
    __table_args__ = (UniqueConstraint("user_id", "id", name="uq_planning_runs_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    input_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    output_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class GoalRecord(Base):
    __tablename__ = "goals"
    __table_args__ = (UniqueConstraint("user_id", "goal_id", name="uq_goals_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    goal_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ProjectRecord(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_projects_user_external"),
        ForeignKeyConstraint(["user_id", "goal_id"], ["goals.user_id", "goals.goal_id"], name="fk_projects_goal", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    goal_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class MilestoneRecord(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        UniqueConstraint("user_id", "milestone_id", name="uq_milestones_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_milestones_project", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    milestone_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ActionItemRecord(Base):
    __tablename__ = "action_items"
    __table_args__ = (
        UniqueConstraint("user_id", "action_id", name="uq_actions_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_actions_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "milestone_id"], ["milestones.user_id", "milestones.milestone_id"], name="fk_actions_milestone"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False)
    milestone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    energy_needed: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    execution_tier: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ProgressLogRecord(Base):
    __tablename__ = "progress_logs"
    __table_args__ = (
        UniqueConstraint("user_id", "progress_id", name="uq_progress_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_progress_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "goal_id"], ["goals.user_id", "goals.goal_id"], name="fk_progress_goal"),
        ForeignKeyConstraint(["user_id", "action_id"], ["action_items.user_id", "action_items.action_id"], name="fk_progress_action"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    progress_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False)
    goal_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    log_type: Mapped[str] = mapped_column(String(24), nullable=False)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False, default="")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ToolRunRecord(Base):
    __tablename__ = "tool_runs"
    __table_args__ = (
        UniqueConstraint("user_id", "tool_run_id", name="uq_tool_runs_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_tool_runs_project"),
        ForeignKeyConstraint(["user_id", "goal_id"], ["goals.user_id", "goals.goal_id"], name="fk_tool_runs_goal"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tool_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    goal_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(120), nullable=False)
    intent: Mapped[str] = mapped_column(Text, nullable=False, default="")
    input_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    output_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    input_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    output_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class FridgeItemRecord(Base):
    __tablename__ = "fridge_items"
    __table_args__ = (UniqueConstraint("user_id", "item_id", name="uq_fridge_items_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="unknown")
    storage_type: Mapped[str] = mapped_column(String(24), nullable=False, default="unknown")
    purchase_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    estimated_expiration_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    estimated_shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    receipt_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ToolPresetRecord(Base):
    __tablename__ = "tool_presets"
    __table_args__ = (UniqueConstraint("user_id", "preset_id", name="uq_tool_presets_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    preset_id: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    preset_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class MigrationImportRecord(Base):
    __tablename__ = "migration_imports"
    __table_args__ = (
        UniqueConstraint("user_id", "source", "checksum", name="uq_migration_import_user_source_checksum"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    report_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    imported_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ConversationThreadRecord(Base):
    __tablename__ = "conversation_threads"
    __table_args__ = (
        UniqueConstraint("user_id", "thread_id", name="uq_threads_user_external"),
        ForeignKeyConstraint(["user_id", "goal_id"], ["goals.user_id", "goals.goal_id"], name="fk_threads_goal"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_threads_project"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="goal_draft")
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="New long-term goal")
    goal_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    template_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    rolling_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    summary_through_message_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ConversationMessageRecord(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        UniqueConstraint("user_id", "message_id", name="uq_messages_user_external"),
        ForeignKeyConstraint(["user_id", "thread_id"], ["conversation_threads.user_id", "conversation_threads.thread_id"], name="fk_messages_thread", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    structured_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class MetricDefinitionRecord(Base):
    __tablename__ = "metric_definitions"
    __table_args__ = (
        UniqueConstraint("user_id", "metric_id", name="uq_metrics_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_metrics_project", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    metric_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="leading")
    value_type: Mapped[str] = mapped_column(String(24), nullable=False, default="number")
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="increase")
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    ideal_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    acceptable_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    acceptable_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    safety_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    safety_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cadence: Mapped[str] = mapped_column(String(24), nullable=False, default="weekly")
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class MetricEntryRecord(Base):
    __tablename__ = "metric_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "entry_id", name="uq_metric_entries_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_metric_entries_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "metric_id"], ["metric_definitions.user_id", "metric_definitions.metric_id"], name="fk_metric_entries_metric", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    metric_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    observed_at: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    numeric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    text_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    is_anomaly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    anomaly_reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class CheckInScheduleRecord(Base):
    __tablename__ = "check_in_schedules"
    __table_args__ = (
        UniqueConstraint("user_id", "schedule_id", name="uq_checkin_schedules_user_external"),
        UniqueConstraint("user_id", "project_id", name="uq_checkin_schedules_user_project"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_checkin_schedules_project", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    local_time: Mapped[str] = mapped_column(String(5), nullable=False, default="20:00")
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="UTC")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    review_interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    last_check_in_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_review_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class CheckInRecord(Base):
    __tablename__ = "check_ins"
    __table_args__ = (
        UniqueConstraint("user_id", "check_in_id", name="uq_checkins_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_checkins_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "thread_id"], ["conversation_threads.user_id", "conversation_threads.thread_id"], name="fk_checkins_thread"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    check_in_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    thread_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    period_start: Mapped[str] = mapped_column(String(10), nullable=False)
    period_end: Mapped[str] = mapped_column(String(10), nullable=False)
    due_at: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    includes_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    questions_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    answers_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    answered_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    skipped_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class PlanChangeProposalRecord(Base):
    __tablename__ = "plan_change_proposals"
    __table_args__ = (
        UniqueConstraint("user_id", "proposal_id", name="uq_plan_proposals_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_proposals_project"),
        ForeignKeyConstraint(["user_id", "thread_id"], ["conversation_threads.user_id", "conversation_threads.thread_id"], name="fk_proposals_thread"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    thread_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    proposal_type: Mapped[str] = mapped_column(String(24), nullable=False, default="plan_change")
    base_version_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    proposal_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    diff_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    resolved_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class GoalControlPolicyRecord(Base):
    __tablename__ = "goal_control_policies"
    __table_args__ = (
        UniqueConstraint("user_id", "policy_id", name="uq_goal_policies_user_external"),
        UniqueConstraint("user_id", "project_id", name="uq_goal_policies_user_project"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_policies_project", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    policy_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    weekly_capacity_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    buffer_percent: Mapped[float] = mapped_column(Float, nullable=False, default=20.0)
    active_tier: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    ai_usage_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    available_days_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    replan_thresholds_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    stop_rules_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    planning_brief_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class PlanVersionRecord(Base):
    __tablename__ = "plan_versions"
    __table_args__ = (
        UniqueConstraint("user_id", "version_id", name="uq_plan_versions_user_external"),
        UniqueConstraint("user_id", "project_id", "version_number", name="uq_plan_versions_user_project_number"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_versions_project", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="confirmed")
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    milestone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    diff_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    summary: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class PlanDependencyRecord(Base):
    __tablename__ = "plan_dependencies"
    __table_args__ = (
        UniqueConstraint("user_id", "dependency_id", name="uq_plan_dependencies_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_dependencies_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "predecessor_action_id"], ["action_items.user_id", "action_items.action_id"], name="fk_dependencies_predecessor", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "successor_action_id"], ["action_items.user_id", "action_items.action_id"], name="fk_dependencies_successor", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dependency_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    predecessor_action_id: Mapped[str] = mapped_column(String(64), nullable=False)
    successor_action_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class EffortEntryRecord(Base):
    __tablename__ = "effort_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "effort_id", name="uq_effort_entries_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_effort_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "action_id"], ["action_items.user_id", "action_items.action_id"], name="fk_effort_action"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    effort_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    occurred_on: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ActionEventLinkRecord(Base):
    __tablename__ = "action_event_links"
    __table_args__ = (
        UniqueConstraint("user_id", "link_id", name="uq_action_event_links_user_external"),
        ForeignKeyConstraint(["user_id", "project_id"], ["projects.user_id", "projects.project_id"], name="fk_action_links_project", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "action_id"], ["action_items.user_id", "action_items.action_id"], name="fk_action_links_action", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "event_id"], ["events.user_id", "events.id"], name="fk_action_links_event", ondelete="CASCADE"),
    )

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    link_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class AIUsageEventRecord(Base):
    __tablename__ = "ai_usage_events"
    __table_args__ = (UniqueConstraint("user_id", "usage_event_id", name="uq_ai_usage_user_external"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usage_event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    thread_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    usage_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="success")
    estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, index=True)


class AIUsageMonthlyRecord(Base):
    __tablename__ = "ai_usage_monthly"
    __table_args__ = (UniqueConstraint("user_id", "month_key", name="uq_ai_usage_user_month"),)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    month_key: Mapped[str] = mapped_column(String(7), nullable=False)
    routine_input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    routine_output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    planning_input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    planning_output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)
