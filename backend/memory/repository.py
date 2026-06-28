from __future__ import annotations

import json
from contextlib import closing
from pathlib import Path
from typing import Any

from .db import connect, initialize_database


class MemoryRowNotFoundError(KeyError):
    pass


JSON_COLUMNS = {"metadata_json", "input_json", "output_json"}


class MemoryRepository:
    def __init__(self, db_path: Path | str | None = None) -> None:
        self.db_path = initialize_database(db_path)

    def list_goals(self) -> list[dict[str, Any]]:
        return self._fetch_all("SELECT * FROM goals ORDER BY created_at DESC, title ASC")

    def get_goal(self, goal_id: str) -> dict[str, Any]:
        return self._fetch_one("SELECT * FROM goals WHERE goal_id = ?", (goal_id,), "goal", goal_id)

    def create_goal(self, goal: dict[str, Any]) -> dict[str, Any]:
        self._execute(
            """
            INSERT INTO goals (
              goal_id, title, description, status, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                goal["goal_id"],
                goal["title"],
                goal["description"],
                goal["status"],
                json.dumps(goal.get("metadata", {}), sort_keys=True),
                goal["created_at"],
                goal["updated_at"],
            ),
        )
        return self.get_goal(goal["goal_id"])

    def update_goal(self, goal_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self._update_row(
            "goals",
            "goal_id",
            goal_id,
            patch,
            {"title", "description", "status", "metadata", "updated_at"},
        )

    def list_projects(self) -> list[dict[str, Any]]:
        return self._fetch_all("SELECT * FROM projects ORDER BY created_at DESC, title ASC")

    def get_project(self, project_id: str) -> dict[str, Any]:
        return self._fetch_one(
            "SELECT * FROM projects WHERE project_id = ?",
            (project_id,),
            "project",
            project_id,
        )

    def create_project(self, project: dict[str, Any]) -> dict[str, Any]:
        self._execute(
            """
            INSERT INTO projects (
              project_id, goal_id, title, description, status, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project["project_id"],
                project["goal_id"],
                project["title"],
                project["description"],
                project["status"],
                json.dumps(project.get("metadata", {}), sort_keys=True),
                project["created_at"],
                project["updated_at"],
            ),
        )
        return self.get_project(project["project_id"])

    def update_project(self, project_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self._update_row(
            "projects",
            "project_id",
            project_id,
            patch,
            {"title", "description", "status", "metadata", "updated_at"},
        )

    def list_milestones(self, project_id: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at DESC, title ASC",
            (project_id,),
        )

    def get_milestone(self, milestone_id: str) -> dict[str, Any]:
        return self._fetch_one(
            "SELECT * FROM milestones WHERE milestone_id = ?",
            (milestone_id,),
            "milestone",
            milestone_id,
        )

    def create_milestone(self, milestone: dict[str, Any]) -> dict[str, Any]:
        self._execute(
            """
            INSERT INTO milestones (
              milestone_id, project_id, title, description, due_date, status,
              metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                milestone["milestone_id"],
                milestone["project_id"],
                milestone["title"],
                milestone["description"],
                milestone.get("due_date"),
                milestone["status"],
                json.dumps(milestone.get("metadata", {}), sort_keys=True),
                milestone["created_at"],
                milestone["updated_at"],
            ),
        )
        return self.get_milestone(milestone["milestone_id"])

    def update_milestone(self, milestone_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self._update_row(
            "milestones",
            "milestone_id",
            milestone_id,
            patch,
            {"title", "description", "due_date", "status", "metadata", "updated_at"},
        )

    def list_actions(self, project_id: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM action_items WHERE project_id = ? ORDER BY created_at DESC, title ASC",
            (project_id,),
        )

    def get_action(self, action_id: str) -> dict[str, Any]:
        return self._fetch_one(
            "SELECT * FROM action_items WHERE action_id = ?",
            (action_id,),
            "action item",
            action_id,
        )

    def create_action(self, action: dict[str, Any]) -> dict[str, Any]:
        self._execute(
            """
            INSERT INTO action_items (
              action_id, project_id, milestone_id, title, description, due_date, status,
              metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action["action_id"],
                action["project_id"],
                action.get("milestone_id"),
                action["title"],
                action["description"],
                action.get("due_date"),
                action["status"],
                json.dumps(action.get("metadata", {}), sort_keys=True),
                action["created_at"],
                action["updated_at"],
            ),
        )
        return self.get_action(action["action_id"])

    def update_action(self, action_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self._update_row(
            "action_items",
            "action_id",
            action_id,
            patch,
            {
                "title",
                "description",
                "due_date",
                "milestone_id",
                "status",
                "metadata",
                "updated_at",
            },
        )

    def list_progress(self, project_id: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM progress_logs WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        )

    def create_progress(self, progress: dict[str, Any]) -> dict[str, Any]:
        self._execute(
            """
            INSERT INTO progress_logs (
              progress_id, project_id, goal_id, action_id, log_type, summary, details,
              metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                progress["progress_id"],
                progress["project_id"],
                progress.get("goal_id"),
                progress.get("action_id"),
                progress["log_type"],
                progress["summary"],
                progress["details"],
                json.dumps(progress.get("metadata", {}), sort_keys=True),
                progress["created_at"],
                progress["updated_at"],
            ),
        )
        return self._fetch_one(
            "SELECT * FROM progress_logs WHERE progress_id = ?",
            (progress["progress_id"],),
            "progress log",
            progress["progress_id"],
        )

    def create_tool_run(self, tool_run: dict[str, Any]) -> dict[str, Any]:
        self._execute(
            """
            INSERT INTO tool_runs (
              tool_run_id, project_id, goal_id, tool_name, intent, input_summary,
              output_summary, status, input_json, output_json, error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tool_run["tool_run_id"],
                tool_run.get("project_id"),
                tool_run.get("goal_id"),
                tool_run["tool_name"],
                tool_run["intent"],
                tool_run["input_summary"],
                tool_run["output_summary"],
                tool_run["status"],
                json.dumps(tool_run.get("input", {}), sort_keys=True),
                json.dumps(tool_run.get("output", {}), sort_keys=True),
                tool_run.get("error", ""),
                tool_run["created_at"],
                tool_run["updated_at"],
            ),
        )
        return normalize_tool_run(
            self._fetch_one(
                "SELECT * FROM tool_runs WHERE tool_run_id = ?",
                (tool_run["tool_run_id"],),
                "tool run",
                tool_run["tool_run_id"],
            )
        )

    def list_tool_runs(self, project_id: str | None = None) -> list[dict[str, Any]]:
        if project_id:
            rows = self._fetch_all(
                "SELECT * FROM tool_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50",
                (project_id,),
            )
        else:
            rows = self._fetch_all("SELECT * FROM tool_runs ORDER BY created_at DESC LIMIT 50")
        return [normalize_tool_run(row) for row in rows]

    def get_tool_run(self, tool_run_id: str) -> dict[str, Any]:
        return normalize_tool_run(
            self._fetch_one(
                "SELECT * FROM tool_runs WHERE tool_run_id = ?",
                (tool_run_id,),
                "tool run",
                tool_run_id,
            )
        )

    def search(self, query: str) -> list[dict[str, Any]]:
        like = f"%{query.lower()}%"
        searches = [
            (
                "goal",
                """
                SELECT goal_id AS item_id, NULL AS project_id, goal_id, title, description, status, updated_at
                FROM goals
                WHERE lower(title) LIKE ? OR lower(description) LIKE ?
                """,
            ),
            (
                "project",
                """
                SELECT project_id AS item_id, project_id, goal_id, title, description, status, updated_at
                FROM projects
                WHERE lower(title) LIKE ? OR lower(description) LIKE ?
                """,
            ),
            (
                "milestone",
                """
                SELECT milestone_id AS item_id, project_id, NULL AS goal_id, title, description, status, updated_at
                FROM milestones
                WHERE lower(title) LIKE ? OR lower(description) LIKE ?
                """,
            ),
            (
                "action_item",
                """
                SELECT action_id AS item_id, project_id, NULL AS goal_id, title, description, status, updated_at
                FROM action_items
                WHERE lower(title) LIKE ? OR lower(description) LIKE ?
                """,
            ),
            (
                "progress_log",
                """
                SELECT progress_id AS item_id, project_id, goal_id, summary AS title, details AS description,
                  log_type AS status, updated_at
                FROM progress_logs
                WHERE lower(summary) LIKE ? OR lower(details) LIKE ?
                """,
            ),
            (
                "tool_run",
                """
                SELECT tool_run_id AS item_id, project_id, goal_id, tool_name AS title,
                  output_summary AS description,
                  status, updated_at
                FROM tool_runs
                WHERE lower(tool_name) LIKE ? OR lower(intent) LIKE ? OR lower(output_summary) LIKE ?
                """,
            ),
        ]
        results: list[dict[str, Any]] = []
        with closing(connect(self.db_path)) as connection:
            for entity_type, sql in searches:
                params = (like, like, like) if entity_type == "tool_run" else (like, like)
                rows = connection.execute(sql, params).fetchall()
                for row in rows:
                    item = dict(row)
                    item["entity_type"] = entity_type
                    results.append(item)
        return sorted(results, key=lambda item: item["updated_at"], reverse=True)[:50]

    def _fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with closing(connect(self.db_path)) as connection:
            rows = connection.execute(sql, params).fetchall()
        return [row_to_dict(row) for row in rows]

    def _fetch_one(
        self,
        sql: str,
        params: tuple[Any, ...],
        label: str,
        entity_id: str,
    ) -> dict[str, Any]:
        with closing(connect(self.db_path)) as connection:
            row = connection.execute(sql, params).fetchone()
        if row is None:
            raise MemoryRowNotFoundError(f"{label} not found: {entity_id}")
        return row_to_dict(row)

    def _execute(self, sql: str, params: tuple[Any, ...]) -> None:
        with closing(connect(self.db_path)) as connection:
            connection.execute(sql, params)
            connection.commit()

    def _update_row(
        self,
        table: str,
        id_column: str,
        entity_id: str,
        patch: dict[str, Any],
        allowed_fields: set[str],
    ) -> dict[str, Any]:
        fields = {key: value for key, value in patch.items() if key in allowed_fields}
        if "metadata" in fields:
            fields["metadata_json"] = json.dumps(fields.pop("metadata"), sort_keys=True)
        if not fields:
            return self._fetch_one(
                f"SELECT * FROM {table} WHERE {id_column} = ?",
                (entity_id,),
                table,
                entity_id,
            )

        assignments = ", ".join(f"{key} = ?" for key in fields)
        params = tuple(fields.values()) + (entity_id,)
        with closing(connect(self.db_path)) as connection:
            cursor = connection.execute(
                f"UPDATE {table} SET {assignments} WHERE {id_column} = ?",
                params,
            )
            if cursor.rowcount == 0:
                raise MemoryRowNotFoundError(f"{table} not found: {entity_id}")
            connection.commit()

        return self._fetch_one(
            f"SELECT * FROM {table} WHERE {id_column} = ?",
            (entity_id,),
            table,
            entity_id,
        )


def row_to_dict(row: Any) -> dict[str, Any]:
    item = dict(row)
    for column in list(item):
        if column not in JSON_COLUMNS:
            continue
        value = item.pop(column)
        public_key = column.removesuffix("_json")
        try:
            item[public_key] = json.loads(value) if value else {}
        except json.JSONDecodeError:
            item[public_key] = {}
    return item


def normalize_tool_run(item: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(item)
    normalized["id"] = normalized["tool_run_id"]
    normalized["related_project_id"] = normalized.get("project_id")
    normalized["related_goal_id"] = normalized.get("goal_id")
    return normalized
