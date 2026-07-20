"""Stabilize project/goal relationships and record deterministic repairs.

Revision ID: 20260719_0008
Revises: 20260715_0007
Create Date: 2026-07-19
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "20260719_0008"
down_revision = "20260715_0007"
branch_labels = None
depends_on = None


RELATIONSHIPS = (
    ("progress_logs", "progress_id"),
    ("tool_runs", "tool_run_id"),
    ("conversation_threads", "thread_id"),
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_project_goals() -> None:
    bind = op.get_bind()
    repair_table = sa.table(
        "data_integrity_repairs",
        sa.column("user_id", sa.String()),
        sa.column("source_table", sa.String()),
        sa.column("external_id", sa.String()),
        sa.column("field_name", sa.String()),
        sa.column("previous_value", sa.String()),
        sa.column("repaired_value", sa.String()),
        sa.column("reason", sa.String()),
        sa.column("repaired_at", sa.String()),
    )
    timestamp = _now_iso()
    for table_name, external_id_column in RELATIONSHIPS:
        rows = bind.execute(
            sa.text(
                f"""
                SELECT child.row_id AS row_id,
                       child.user_id AS user_id,
                       child.{external_id_column} AS external_id,
                       child.goal_id AS previous_goal_id,
                       project.goal_id AS project_goal_id
                FROM {table_name} AS child
                JOIN projects AS project
                  ON project.user_id = child.user_id
                 AND project.project_id = child.project_id
                WHERE child.project_id IS NOT NULL
                  AND (child.goal_id IS NULL OR child.goal_id <> project.goal_id)
                """
            )
        ).mappings().all()
        for row in rows:
            bind.execute(
                repair_table.insert().values(
                    user_id=str(row["user_id"]),
                    source_table=table_name,
                    external_id=str(row["external_id"]),
                    field_name="goal_id",
                    previous_value=None if row["previous_goal_id"] is None else str(row["previous_goal_id"]),
                    repaired_value=str(row["project_goal_id"]),
                    reason="Normalized goal_id to the canonical project.goal_id before adding the composite relationship.",
                    repaired_at=timestamp,
                )
            )
            bind.execute(
                sa.text(f"UPDATE {table_name} SET goal_id = :goal_id WHERE row_id = :row_id"),
                {"goal_id": row["project_goal_id"], "row_id": row["row_id"]},
            )


def _quarantine_duplicate_checkins() -> None:
    bind = op.get_bind()
    duplicates = bind.execute(
        sa.text(
            """
            SELECT user_id, project_id, period_end
            FROM check_ins
            GROUP BY user_id, project_id, period_end
            HAVING COUNT(*) > 1
            """
        )
    ).mappings().all()
    quarantine = sa.table(
        "data_integrity_quarantine",
        sa.column("user_id", sa.String()),
        sa.column("source_table", sa.String()),
        sa.column("external_id", sa.String()),
        sa.column("reason", sa.String()),
        sa.column("payload_json", sa.JSON()),
        sa.column("quarantined_at", sa.String()),
    )
    for duplicate in duplicates:
        rows = bind.execute(
            sa.text(
                """
                SELECT *
                FROM check_ins
                WHERE user_id = :user_id
                  AND project_id = :project_id
                  AND period_end = :period_end
                ORDER BY row_id ASC
                """
            ),
            dict(duplicate),
        ).mappings().all()
        for row in rows[1:]:
            payload = {key: value for key, value in dict(row).items() if key != "row_id"}
            bind.execute(
                quarantine.insert().values(
                    user_id=str(row["user_id"]),
                    source_table="check_ins",
                    external_id=str(row["check_in_id"]),
                    reason="Duplicate project Check-in for the same period_end; earliest row retained.",
                    payload_json=payload,
                    quarantined_at=_now_iso(),
                )
            )
            bind.execute(
                sa.text("DELETE FROM check_ins WHERE row_id = :row_id"),
                {"row_id": row["row_id"]},
            )


def upgrade() -> None:
    op.create_table(
        "data_integrity_repairs",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("source_table", sa.String(80), nullable=False),
        sa.Column("external_id", sa.String(128), nullable=False),
        sa.Column("field_name", sa.String(80), nullable=False),
        sa.Column("previous_value", sa.String(255), nullable=True),
        sa.Column("repaired_value", sa.String(255), nullable=True),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("repaired_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_integrity_repairs_user", "data_integrity_repairs", ["user_id"])

    _normalize_project_goals()
    _quarantine_duplicate_checkins()

    with op.batch_alter_table("check_ins") as batch:
        batch.create_unique_constraint(
            "uq_checkins_user_project_period", ["user_id", "project_id", "period_end"]
        )

    with op.batch_alter_table("projects") as batch:
        batch.create_unique_constraint(
            "uq_projects_user_project_goal",
            ["user_id", "project_id", "goal_id"],
        )
    checks = {
        "progress_logs": ("ck_progress_project_goal_present", "goal_id IS NOT NULL"),
        "tool_runs": ("ck_tool_runs_project_goal_present", "project_id IS NULL OR goal_id IS NOT NULL"),
        "conversation_threads": ("ck_threads_project_goal_present", "project_id IS NULL OR goal_id IS NOT NULL"),
    }

    for table_name, _external_id_column in RELATIONSHIPS:
        with op.batch_alter_table(table_name) as batch:
            batch.create_foreign_key(
                f"fk_{'threads' if table_name == 'conversation_threads' else 'progress' if table_name == 'progress_logs' else 'tool_runs'}_project_goal",
                "projects",
                ["user_id", "project_id", "goal_id"],
                ["user_id", "project_id", "goal_id"],
            )
            check_name, condition = checks[table_name]
            batch.create_check_constraint(check_name, condition)


def downgrade() -> None:
    checks = {
        "progress_logs": "ck_progress_project_goal_present",
        "tool_runs": "ck_tool_runs_project_goal_present",
        "conversation_threads": "ck_threads_project_goal_present",
    }
    for table_name, _external_id_column in reversed(RELATIONSHIPS):
        constraint = (
            "fk_threads_project_goal"
            if table_name == "conversation_threads"
            else "fk_progress_project_goal"
            if table_name == "progress_logs"
            else "fk_tool_runs_project_goal"
        )
        with op.batch_alter_table(table_name) as batch:
            batch.drop_constraint(checks[table_name], type_="check")
            batch.drop_constraint(constraint, type_="foreignkey")
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("uq_projects_user_project_goal", type_="unique")
    with op.batch_alter_table("check_ins") as batch:
        batch.drop_constraint("uq_checkins_user_project_period", type_="unique")
    op.drop_index("ix_integrity_repairs_user", table_name="data_integrity_repairs")
    op.drop_table("data_integrity_repairs")
