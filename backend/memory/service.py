from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.engine import Engine

from .repository import MemoryRepository, MemoryRowNotFoundError

GOAL_STATUSES = {"active", "paused", "completed", "archived"}
PROJECT_STATUSES = {"active", "paused", "completed"}
MILESTONE_STATUSES = {"not_started", "in_progress", "done", "blocked", "skipped"}
ACTION_STATUSES = {"todo", "scheduled", "done", "blocked", "skipped"}
PROGRESS_LOG_TYPES = {"update", "decision", "blocker", "review", "tool_result"}
TOOL_RUN_STATUSES = {"success", "failed", "needs_user_confirmation"}


ACTION_PRIORITIES = {'high', 'medium', 'low'}
ACTION_ENERGY_LEVELS = {'high', 'medium', 'low'}
ACTION_EXECUTION_TIERS = {'minimum', 'standard', 'stretch'}

IDENTIFIER_MAX_LENGTH = 64
TITLE_MAX_LENGTH = 200
PROGRESS_SUMMARY_MAX_LENGTH = 500
TOOL_NAME_MAX_LENGTH = 120
MYSQL_INTEGER_MAX = 2_147_483_647

GOAL_FIELDS = {'title', 'description', 'status', 'metadata'}
PROJECT_FIELDS = {'goal_id', 'title', 'description', 'status', 'metadata'}
MILESTONE_FIELDS = {'project_id', 'title', 'description', 'due_date', 'status', 'metadata'}
ACTION_FIELDS = {
    'project_id',
    'milestone_id',
    'title',
    'description',
    'due_date',
    'status',
    'estimated_minutes',
    'priority',
    'energy_needed',
    'execution_tier',
    'metadata',
}
PROGRESS_FIELDS = {
    'project_id',
    'goal_id',
    'action_id',
    'log_type',
    'summary',
    'details',
    'metadata',
}
TOOL_RUN_FIELDS = {
    'project_id',
    'related_project_id',
    'goal_id',
    'related_goal_id',
    'tool_name',
    'intent',
    'input_summary',
    'output_summary',
    'status',
    'input',
    'output',
    'error',
}


class MemoryValidationError(ValueError):
    pass


class MemoryNotFoundError(KeyError):
    pass


class LongTermMemoryService:
    def __init__(
        self,
        db_path: Path | str | None = None,
        repository: MemoryRepository | None = None,
        *,
        engine: Engine | None = None,
        user_id: str = "local",
    ) -> None:
        self.repository = repository if repository else MemoryRepository(db_path, engine=engine, user_id=user_id)

    def list_goals(self) -> list[dict[str, Any]]:
        return self.repository.list_goals()

    def create_goal(self, payload: dict[str, Any]) -> dict[str, Any]:
        validate_payload(payload, GOAL_FIELDS)
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

    def create_goal_project(self, payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
        validate_payload(payload, {'goal', 'project'})
        goal_payload = payload.get("goal")
        project_payload = payload.get("project")
        validate_payload(goal_payload, GOAL_FIELDS, 'goal')
        validate_payload(project_payload, GOAL_FIELDS, 'project')
        if not isinstance(goal_payload, dict) or not isinstance(project_payload, dict):
            raise MemoryValidationError("goal and project are required")

        now = utc_now_iso()
        goal = {
            "goal_id": stable_id("goal"),
            "title": required_text(goal_payload, "title"),
            "description": optional_text(goal_payload.get("description")),
            "status": normalized_status(goal_payload, "status", GOAL_STATUSES, "active"),
            "metadata": optional_dict(goal_payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        project = {
            "project_id": stable_id("project"),
            "goal_id": goal["goal_id"],
            "title": required_text(project_payload, "title"),
            "description": optional_text(project_payload.get("description")),
            "status": normalized_status(
                project_payload,
                "status",
                PROJECT_STATUSES,
                "active",
            ),
            "metadata": optional_dict(project_payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        created_goal, created_project = self.repository.create_goal_project(goal, project)
        return {"goal": created_goal, "project": created_project}

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
        validate_payload(payload, PROJECT_FIELDS)
        goal_id = required_text(payload, "goal_id", IDENTIFIER_MAX_LENGTH)
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
        current = self.get_project(project_id)
        patch = update_patch(
            payload,
            {"title", "description", "status", "metadata"},
            immutable={'goal_id'},
        )
        if 'goal_id' in payload:
            supplied_goal_id = required_text(
                payload,
                'goal_id',
                IDENTIFIER_MAX_LENGTH,
            )
            if supplied_goal_id != current['goal_id']:
                raise MemoryValidationError('goal_id cannot be changed')
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
        validate_payload(payload, MILESTONE_FIELDS)
        project_id = required_text(payload, "project_id", IDENTIFIER_MAX_LENGTH)
        self.get_project(project_id)
        now = utc_now_iso()
        milestone = {
            "milestone_id": stable_id("milestone"),
            "project_id": project_id,
            "title": required_text(payload, "title"),
            "description": optional_text(payload.get("description")),
            "due_date": optional_iso_date(payload.get("due_date")),
            "status": normalized_status(payload, "status", MILESTONE_STATUSES, "not_started"),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_milestone(milestone)

    def update_milestone(self, milestone_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self._map_not_found(
            lambda: self.repository.get_milestone(milestone_id)
        )
        patch = update_patch(
            payload,
            {"title", "description", "due_date", "status", "metadata"},
            immutable={'project_id'},
        )
        if 'project_id' in payload:
            supplied_project_id = required_text(
                payload,
                'project_id',
                IDENTIFIER_MAX_LENGTH,
            )
            if supplied_project_id != current['project_id']:
                raise MemoryValidationError('project_id cannot be changed')
        if "status" in patch:
            patch["status"] = normalized_status(patch, "status", MILESTONE_STATUSES, "not_started")
        if "title" in patch:
            patch["title"] = required_text(patch, "title")
        if "description" in patch:
            patch["description"] = optional_text(patch["description"])
        if "due_date" in patch:
            patch["due_date"] = optional_iso_date(patch["due_date"])
        if "metadata" in patch:
            patch["metadata"] = optional_dict(patch["metadata"])
        patch["updated_at"] = utc_now_iso()
        return self._map_not_found(lambda: self.repository.update_milestone(milestone_id, patch))

    def list_actions(self, project_id: str) -> list[dict[str, Any]]:
        self.get_project(project_id)
        return self.repository.list_actions(project_id)

    def create_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        validate_payload(payload, ACTION_FIELDS)
        project_id = required_text(payload, "project_id", IDENTIFIER_MAX_LENGTH)
        self.get_project(project_id)
        milestone_id = optional_text(
            payload.get("milestone_id"),
            'milestone_id',
            maximum=IDENTIFIER_MAX_LENGTH,
        ) or None
        if milestone_id:
            milestone = self._map_not_found(lambda: self.repository.get_milestone(milestone_id))
            if milestone["project_id"] != project_id:
                raise MemoryValidationError("milestone_id must belong to the selected project")
        now = utc_now_iso()
        action = {
            "action_id": stable_id("action"),
            "project_id": project_id,
            "milestone_id": milestone_id,
            "title": required_text(payload, "title"),
            "description": optional_text(payload.get("description")),
            "due_date": optional_iso_date(payload.get("due_date")),
            "status": normalized_status(payload, "status", ACTION_STATUSES, "todo"),
            "estimated_minutes": positive_int(
                payload.get("estimated_minutes"),
                'estimated_minutes',
                30,
            ),
            "priority": normalized_status(
                payload,
                'priority',
                ACTION_PRIORITIES,
                'medium',
            ),
            "energy_needed": normalized_status(
                payload,
                'energy_needed',
                ACTION_ENERGY_LEVELS,
                'medium',
            ),
            "execution_tier": normalized_status(
                payload,
                'execution_tier',
                ACTION_EXECUTION_TIERS,
                'standard',
            ),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_action(action)

    def update_action(self, action_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        action = self._map_not_found(lambda: self.repository.get_action(action_id))
        patch = update_patch(
            payload,
            {
                "title",
                "description",
                "due_date",
                "milestone_id",
                "status",
                "estimated_minutes",
                "priority",
                "energy_needed",
                "execution_tier",
                "metadata",
            },
            immutable={'project_id'},
        )
        if 'project_id' in payload:
            supplied_project_id = required_text(
                payload,
                'project_id',
                IDENTIFIER_MAX_LENGTH,
            )
            if supplied_project_id != action['project_id']:
                raise MemoryValidationError('project_id cannot be changed')
        if "status" in patch:
            patch["status"] = normalized_status(patch, "status", ACTION_STATUSES, "todo")
        if "title" in patch:
            patch["title"] = required_text(patch, "title")
        if "description" in patch:
            patch["description"] = optional_text(patch["description"])
        if "due_date" in patch:
            patch["due_date"] = optional_iso_date(patch["due_date"])
        if "milestone_id" in patch:
            patch["milestone_id"] = optional_text(
                patch["milestone_id"],
                'milestone_id',
                maximum=IDENTIFIER_MAX_LENGTH,
            ) or None
            if patch["milestone_id"]:
                milestone = self._map_not_found(lambda: self.repository.get_milestone(patch["milestone_id"]))
                if milestone["project_id"] != action["project_id"]:
                    raise MemoryValidationError("milestone_id must belong to the action project")
        if 'estimated_minutes' in patch:
            patch['estimated_minutes'] = positive_int(
                patch['estimated_minutes'],
                'estimated_minutes',
                30,
            )
        for field, allowed, default in (
            ('priority', ACTION_PRIORITIES, 'medium'),
            ('energy_needed', ACTION_ENERGY_LEVELS, 'medium'),
            ('execution_tier', ACTION_EXECUTION_TIERS, 'standard'),
        ):
            if field in patch:
                patch[field] = normalized_status(
                    patch,
                    field,
                    allowed,
                    default,
                )
        if "metadata" in patch:
            patch["metadata"] = optional_dict(patch["metadata"])
        patch["updated_at"] = utc_now_iso()
        return self._map_not_found(lambda: self.repository.update_action(action_id, patch))

    def list_progress(self, project_id: str) -> list[dict[str, Any]]:
        self.get_project(project_id)
        return self.repository.list_progress(project_id)

    def create_progress(self, payload: dict[str, Any]) -> dict[str, Any]:
        validate_payload(payload, PROGRESS_FIELDS)
        project_id = required_text(payload, "project_id", IDENTIFIER_MAX_LENGTH)
        project = self.get_project(project_id)
        now = utc_now_iso()
        goal_id = optional_text(
            payload.get("goal_id"),
            'goal_id',
            maximum=IDENTIFIER_MAX_LENGTH,
        ) or project["goal_id"]
        if goal_id != project["goal_id"]:
            raise MemoryValidationError("goal_id must match the selected project")
        action_id = optional_text(
            payload.get("action_id"),
            'action_id',
            maximum=IDENTIFIER_MAX_LENGTH,
        ) or None
        if action_id:
            action = self._map_not_found(lambda: self.repository.get_action(action_id))
            if action["project_id"] != project_id:
                raise MemoryValidationError("action_id must belong to the selected project")
        progress = {
            "progress_id": stable_id("progress"),
            "project_id": project_id,
            "goal_id": goal_id,
            "action_id": action_id,
            "log_type": normalized_status(payload, "log_type", PROGRESS_LOG_TYPES, "update"),
            "summary": required_text(payload, "summary", PROGRESS_SUMMARY_MAX_LENGTH),
            "details": optional_text(payload.get("details")),
            "metadata": optional_dict(payload.get("metadata")),
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_progress(progress)

    def create_tool_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        validate_payload(payload, TOOL_RUN_FIELDS)
        if (
            'project_id' in payload
            and 'related_project_id' in payload
            and payload['project_id'] != payload['related_project_id']
        ):
            raise MemoryValidationError(
                'project_id and related_project_id must match'
            )
        if (
            'goal_id' in payload
            and 'related_goal_id' in payload
            and payload['goal_id'] != payload['related_goal_id']
        ):
            raise MemoryValidationError('goal_id and related_goal_id must match')
        project_id = optional_text(
            payload.get('related_project_id', payload.get('project_id')),
            'project_id',
            maximum=IDENTIFIER_MAX_LENGTH,
        ) or None
        goal_id = optional_text(
            payload.get('related_goal_id', payload.get('goal_id')),
            'goal_id',
            maximum=IDENTIFIER_MAX_LENGTH,
        ) or None
        if project_id:
            project = self.get_project(project_id)
            if goal_id and goal_id != project["goal_id"]:
                raise MemoryValidationError("goal_id must match the selected project")
            goal_id = project["goal_id"]
        elif goal_id:
            self._map_not_found(lambda: self.repository.get_goal(goal_id))

        now = utc_now_iso()
        tool_run = {
            "tool_run_id": stable_id("toolrun"),
            "project_id": project_id,
            "goal_id": goal_id,
            "tool_name": required_text(
                payload,
                "tool_name",
                TOOL_NAME_MAX_LENGTH,
            ),
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


def validate_payload(
    payload: object,
    allowed: set[str],
    label: str = 'payload',
) -> None:
    if not isinstance(payload, dict):
        raise MemoryValidationError(label + ' must be an object')
    unknown = sorted(set(payload) - allowed)
    if unknown:
        raise MemoryValidationError(
            label + ' contains unknown fields: ' + ', '.join(unknown)
        )


def required_text(
    payload: dict[str, Any],
    key: str,
    maximum: int = TITLE_MAX_LENGTH,
) -> str:
    value = optional_text(payload.get(key), key, maximum=maximum)
    if not value:
        raise MemoryValidationError(f"{key} is required")
    return value


def optional_text(
    value: object,
    field: str = 'value',
    *,
    maximum: int | None = None,
) -> str:
    if value is None:
        return ''
    if not isinstance(value, str):
        raise MemoryValidationError(field + ' must be a string')
    clean = value.strip()
    if maximum is not None and len(clean) > maximum:
        raise MemoryValidationError(
            field + ' must be at most ' + str(maximum) + ' characters'
        )
    return clean


def optional_dict(value: object) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise MemoryValidationError('metadata and structured values must be objects')
    return value


def optional_iso_date(value: object, field: str = 'due_date') -> str | None:
    clean = optional_text(value, field, maximum=10)
    if not clean:
        return None
    try:
        parsed = date.fromisoformat(clean)
    except ValueError as error:
        raise MemoryValidationError(field + ' must use YYYY-MM-DD') from error
    if parsed.isoformat() != clean:
        raise MemoryValidationError(field + ' must use YYYY-MM-DD')
    return clean


def positive_int(value: object, field: str, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise MemoryValidationError(field + ' must be an integer')
    if value <= 0 or value > MYSQL_INTEGER_MAX:
        raise MemoryValidationError(
            field + ' must be between 1 and ' + str(MYSQL_INTEGER_MAX)
        )
    return value


def normalized_status(
    payload: dict[str, Any],
    key: str,
    allowed: set[str],
    default: str,
) -> str:
    value = optional_text(payload.get(key), key, maximum=32) or default
    if value not in allowed:
        raise MemoryValidationError(f"{key} must be one of: {', '.join(sorted(allowed))}")
    return value


def update_patch(
    payload: dict[str, Any],
    allowed: set[str],
    *,
    immutable: set[str] | None = None,
) -> dict[str, Any]:
    immutable_fields = immutable or set()
    validate_payload(payload, allowed | immutable_fields)
    patch = {key: value for key, value in payload.items() if key in allowed}
    if not patch:
        raise MemoryValidationError('update payload must include at least one change')
    return patch
