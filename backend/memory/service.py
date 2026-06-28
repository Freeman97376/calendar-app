from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .repository import MemoryRepository, MemoryRowNotFoundError

GOAL_STATUSES = {"active", "paused", "completed", "archived"}
PROJECT_STATUSES = {"active", "paused", "completed"}
MILESTONE_STATUSES = {"not_started", "in_progress", "done", "blocked"}
ACTION_STATUSES = {"todo", "scheduled", "done", "blocked"}
PROGRESS_LOG_TYPES = {"update", "decision", "blocker", "review", "tool_result"}
TOOL_RUN_STATUSES = {"success", "failed", "needs_user_confirmation"}


class MemoryValidationError(ValueError):
    pass


class MemoryNotFoundError(KeyError):
    pass


class LongTermMemoryService:
    def __init__(self, db_path: Path | str | None = None, repository: MemoryRepository | None = None) -> None:
        self.repository = repository if repository else MemoryRepository(db_path)

    def list_goals(self) -> list[dict[str, Any]]:
        return self.repository.list_goals()

    def create_goal(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        goal = {
            "goal_id": stable_id("goal"),
            "title": required_text(payload, "title"),
            "description": optional_text(payload.get("description")),
            "status": normalized_status(payload, "status", GOAL_STATUSES, "active"),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_goal(goal)

    def update_goal(self, goal_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        patch = update_patch(payload, {"title", "description", "status", "metadata"})
        if "status" in patch:
            patch["status"] = normalized_status(patch, "status", GOAL_STATUSES, "active")
        if "title" in patch:
            patch["title"] = required_text(patch, "title")
        if "description" in patch:
            patch["description"] = optional_text(patch["description"])
        if "metadata" in patch:
            patch["metadata"] = optional_dict(patch["metadata"])
        patch["updated_at"] = utc_now_iso()
        return self._map_not_found(lambda: self.repository.update_goal(goal_id, patch))

    def list_projects(self) -> list[dict[str, Any]]:
        return self.repository.list_projects()

    def get_project(self, project_id: str) -> dict[str, Any]:
        return self._map_not_found(lambda: self.repository.get_project(project_id))

    def create_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        goal_id = required_text(payload, "goal_id")
        self._map_not_found(lambda: self.repository.get_goal(goal_id))
        now = utc_now_iso()
        project = {
            "project_id": stable_id("project"),
            "goal_id": goal_id,
            "title": required_text(payload, "title"),
            "description": optional_text(payload.get("description")),
            "status": normalized_status(payload, "status", PROJECT_STATUSES, "active"),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_project(project)

    def update_project(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        patch = update_patch(payload, {"title", "description", "status", "metadata"})
        if "status" in patch:
            patch["status"] = normalized_status(patch, "status", PROJECT_STATUSES, "active")
        if "title" in patch:
            patch["title"] = required_text(patch, "title")
        if "description" in patch:
            patch["description"] = optional_text(patch["description"])
        if "metadata" in patch:
            patch["metadata"] = optional_dict(patch["metadata"])
        patch["updated_at"] = utc_now_iso()
        return self._map_not_found(lambda: self.repository.update_project(project_id, patch))

    def list_milestones(self, project_id: str) -> list[dict[str, Any]]:
        self.get_project(project_id)
        return self.repository.list_milestones(project_id)

    def create_milestone(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = required_text(payload, "project_id")
        self.get_project(project_id)
        now = utc_now_iso()
        milestone = {
            "milestone_id": stable_id("milestone"),
            "project_id": project_id,
            "title": required_text(payload, "title"),
            "description": optional_text(payload.get("description")),
            "due_date": optional_text(payload.get("due_date")) or None,
            "status": normalized_status(payload, "status", MILESTONE_STATUSES, "not_started"),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_milestone(milestone)

    def update_milestone(self, milestone_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        patch = update_patch(payload, {"title", "description", "due_date", "status", "metadata"})
        if "status" in patch:
            patch["status"] = normalized_status(patch, "status", MILESTONE_STATUSES, "not_started")
        if "title" in patch:
            patch["title"] = required_text(patch, "title")
        if "description" in patch:
            patch["description"] = optional_text(patch["description"])
        if "due_date" in patch:
            patch["due_date"] = optional_text(patch["due_date"]) or None
        if "metadata" in patch:
            patch["metadata"] = optional_dict(patch["metadata"])
        patch["updated_at"] = utc_now_iso()
        return self._map_not_found(lambda: self.repository.update_milestone(milestone_id, patch))

    def list_actions(self, project_id: str) -> list[dict[str, Any]]:
        self.get_project(project_id)
        return self.repository.list_actions(project_id)

    def create_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = required_text(payload, "project_id")
        self.get_project(project_id)
        now = utc_now_iso()
        action = {
            "action_id": stable_id("action"),
            "project_id": project_id,
            "milestone_id": optional_text(payload.get("milestone_id")) or None,
            "title": required_text(payload, "title"),
            "description": optional_text(payload.get("description")),
            "due_date": optional_text(payload.get("due_date")) or None,
            "status": normalized_status(payload, "status", ACTION_STATUSES, "todo"),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_action(action)

    def update_action(self, action_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        patch = update_patch(
            payload,
            {"title", "description", "due_date", "milestone_id", "status", "metadata"},
        )
        if "status" in patch:
            patch["status"] = normalized_status(patch, "status", ACTION_STATUSES, "todo")
        if "title" in patch:
            patch["title"] = required_text(patch, "title")
        if "description" in patch:
            patch["description"] = optional_text(patch["description"])
        if "due_date" in patch:
            patch["due_date"] = optional_text(patch["due_date"]) or None
        if "milestone_id" in patch:
            patch["milestone_id"] = optional_text(patch["milestone_id"]) or None
        if "metadata" in patch:
            patch["metadata"] = optional_dict(patch["metadata"])
        patch["updated_at"] = utc_now_iso()
        return self._map_not_found(lambda: self.repository.update_action(action_id, patch))

    def list_progress(self, project_id: str) -> list[dict[str, Any]]:
        self.get_project(project_id)
        return self.repository.list_progress(project_id)

    def create_progress(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = required_text(payload, "project_id")
        project = self.get_project(project_id)
        now = utc_now_iso()
        progress = {
            "progress_id": stable_id("progress"),
            "project_id": project_id,
            "goal_id": optional_text(payload.get("goal_id")) or project["goal_id"],
            "action_id": optional_text(payload.get("action_id")) or None,
            "log_type": normalized_status(payload, "log_type", PROGRESS_LOG_TYPES, "update"),
            "summary": required_text(payload, "summary"),
            "details": optional_text(payload.get("details")),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_progress(progress)

    def create_tool_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = optional_text(payload.get("related_project_id") or payload.get("project_id")) or None
        goal_id = optional_text(payload.get("related_goal_id") or payload.get("goal_id")) or None
        if project_id:
            project = self.get_project(project_id)
            goal_id = goal_id or project["goal_id"]
        elif goal_id:
            self._map_not_found(lambda: self.repository.get_goal(goal_id))

        now = utc_now_iso()
        tool_run = {
            "tool_run_id": stable_id("toolrun"),
            "project_id": project_id,
            "goal_id": goal_id,
            "tool_name": required_text(payload, "tool_name"),
            "intent": optional_text(payload.get("intent")),
            "input_summary": optional_text(payload.get("input_summary")),
            "output_summary": optional_text(payload.get("output_summary")),
            "status": normalized_status(payload, "status", TOOL_RUN_STATUSES, "success"),
            "input": optional_dict(payload.get("input")),
            "output": optional_dict(payload.get("output")),
            "error": optional_text(payload.get("error")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_tool_run(tool_run)

    def list_tool_runs(self) -> list[dict[str, Any]]:
        return self.repository.list_tool_runs()

    def list_project_tool_runs(self, project_id: str) -> list[dict[str, Any]]:
        self.get_project(project_id)
        return self.repository.list_tool_runs(project_id)

    def search(self, query: str) -> list[dict[str, Any]]:
        clean_query = query.strip()
        if not clean_query:
            return []
        return self.repository.search(clean_query)

    def _map_not_found(self, action: Any) -> Any:
        try:
            return action()
        except MemoryRowNotFoundError as exc:
            raise MemoryNotFoundError(str(exc)) from exc


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def required_text(payload: dict[str, Any], key: str) -> str:
    value = optional_text(payload.get(key))
    if not value:
        raise MemoryValidationError(f"{key} is required")
    return value


def optional_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def optional_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalized_status(
    payload: dict[str, Any],
    key: str,
    allowed: set[str],
    default: str,
) -> str:
    value = optional_text(payload.get(key)) or default
    if value not in allowed:
        raise MemoryValidationError(f"{key} must be one of: {', '.join(sorted(allowed))}")
    return value


def update_patch(payload: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key in allowed}
