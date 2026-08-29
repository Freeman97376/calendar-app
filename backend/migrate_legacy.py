from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from collections.abc import Mapping
from contextlib import closing
from pathlib import Path
from typing import Any

from .auth import AuthError, AuthService
from .database import create_database_engine, require_migration_head
from .manage_users import ServerDatabaseConfigurationError, require_server_database_url
from .user_data import BACKUP_FORMAT_VERSION, DataPortabilityService, checksum_entities


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CALENDAR_DB = PROJECT_ROOT / "backend" / "data" / "calendar_app.sqlite3"
DEFAULT_MEMORY_DB = PROJECT_ROOT / "backend" / "data" / "long_term_memory.sqlite3"
DEFAULT_FRIDGE_JSON = PROJECT_ROOT / "backend" / "data" / "fridge_inventory.json"


class LegacyImportConfigurationError(RuntimeError):
    pass


def require_legacy_import_database_url(
    configured: str | None,
    environment: Mapping[str, str] | None = None,
) -> str:
    source = os.environ if environment is None else environment
    candidate = (configured or source.get('CALENDAR_DATABASE_URL', '')).strip()
    try:
        return require_server_database_url({'CALENDAR_DATABASE_URL': candidate})
    except ServerDatabaseConfigurationError as error:
        raise LegacyImportConfigurationError(
            'Legacy server import requires an explicit MySQL database URL via '
            '--database-url or CALENDAR_DATABASE_URL.'
        ) from error


ENTITY_IDS = {
    "eventTypes": "id",
    "todos": "id",
    "events": "id",
    "planningRuns": "id",
    "goals": "goal_id",
    "projects": "project_id",
    "milestones": "milestone_id",
    "actions": "action_id",
    "progress": "progress_id",
    "toolRuns": "tool_run_id",
    "fridgeItems": "item_id",
}


def _json_value(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _rows(path: Path, table: str) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        if exists is None:
            return []
        return [dict(row) for row in connection.execute(f'SELECT * FROM "{table}"').fetchall()]


def _calendar_entities(path: Path) -> dict[str, list[dict[str, Any]]]:
    event_types = []
    for row in _rows(path, "event_types"):
        event_types.append({
            "id": row.get("id"), "label": row.get("label"), "color": row.get("color"),
            "appliesTo": row.get("applies_to", "both"), "isArchived": bool(row.get("is_archived")),
            "createdAt": row.get("created_at"), "updatedAt": row.get("updated_at"),
        })
    todos = []
    for row in _rows(path, "todos"):
        todos.append({
            "id": row.get("id"), "title": row.get("title"), "notes": row.get("notes"),
            "status": row.get("status", "todo"), "eventTypeId": row.get("event_type_id", "general"),
            "dueDate": row.get("due_date"), "linkedEventId": row.get("linked_event_id"),
            "longProject": _json_value(row.get("long_project_json"), None),
            "etaMinutes": row.get("eta_minutes", 30), "energyNeeded": row.get("energy_needed", "medium"),
            "priority": row.get("priority", "medium"), "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"), "completedAt": row.get("completed_at"),
        })
    events = []
    for row in _rows(path, "events"):
        events.append({
            "id": row.get("id"), "title": row.get("title"), "description": row.get("description"),
            "displayDetails": row.get("display_details"), "startAt": row.get("start_at"),
            "endAt": row.get("end_at"), "allDay": bool(row.get("all_day")), "color": row.get("color"),
            "eventTypeId": row.get("event_type_id", "general"), "linkedTodoId": row.get("linked_todo_id"),
            "recurrenceRule": _json_value(row.get("recurrence_rule_json"), None),
            "masterId": row.get("master_id"), "exceptionFor": row.get("exception_for"),
            "exceptionDate": row.get("exception_date"),
            "deletedOccurrences": _json_value(row.get("deleted_occurrences_json"), None),
            "syncStatus": row.get("sync_status", "pending"), "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"),
        })
    planning_runs = []
    for row in _rows(path, "planning_runs"):
        planning_runs.append({
            "id": row.get("id"), "summary": row.get("summary", ""),
            "input": _json_value(row.get("input_json"), {}),
            "output": _json_value(row.get("output_json"), {}),
            "createdAt": row.get("created_at"),
        })
    return {
        "eventTypes": event_types,
        "todos": todos,
        "events": events,
        "planningRuns": planning_runs,
    }


def _memory_entities(path: Path) -> dict[str, list[dict[str, Any]]]:
    mappings = {
        "goals": ("goals", {}),
        "projects": ("projects", {}),
        "milestones": ("milestones", {}),
        "actions": ("action_items", {"action_id": "action_id"}),
        "progress": ("progress_logs", {}),
        "toolRuns": ("tool_runs", {"tool_run_id": "tool_run_id"}),
    }
    output: dict[str, list[dict[str, Any]]] = {}
    for entity, (table, _mapping) in mappings.items():
        items = _rows(path, table)
        for item in items:
            if "metadata_json" in item:
                item["metadata"] = _json_value(item.pop("metadata_json"), {})
            if "input_json" in item:
                item["input"] = _json_value(item.pop("input_json"), {})
            if "output_json" in item:
                item["output"] = _json_value(item.pop("output_json"), {})
        output[entity] = items
    return output


def _fridge_entities(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return [dict(item) for item in items if isinstance(item, dict)]


def collect_legacy_entities(calendar_db: Path, memory_db: Path, fridge_json: Path) -> dict[str, Any]:
    entities: dict[str, Any] = {
        **_calendar_entities(calendar_db),
        **_memory_entities(memory_db),
        "fridgeItems": _fridge_entities(fridge_json),
        "toolPresets": [],
        "preferences": {},
    }
    return entities


def _report(entities: dict[str, Any], before: dict[str, Any], duplicate: bool) -> dict[str, Any]:
    report: dict[str, Any] = {}
    before_entities = before.get("entities", {})
    for entity, id_key in ENTITY_IDS.items():
        items = entities.get(entity, [])
        existing = {
            str(item.get(id_key)): item
            for item in before_entities.get(entity, [])
            if isinstance(item, dict)
        }
        counts = {"read": len(items), "created": 0, "updated": 0, "skipped": 0, "failed": 0}
        for item in items:
            external_id = str(item.get(id_key) or "")
            if not external_id:
                counts["failed"] += 1
            elif duplicate:
                counts["skipped"] += 1
            elif external_id not in existing:
                counts["created"] += 1
            else:
                old = existing[external_id]
                source_updated = str(item.get("updatedAt") or item.get("updated_at") or "")
                target_updated = str(old.get("updatedAt") or old.get("updated_at") or "")
                if source_updated and target_updated and source_updated <= target_updated:
                    counts["skipped"] += 1
                else:
                    counts["updated"] += 1
        report[entity] = counts
    return report


def migrate(args: argparse.Namespace) -> dict[str, Any]:
    engine = create_database_engine(args.database_url)
    try:
        if engine.dialect.name == "mysql":
            require_migration_head(engine)
        auth = AuthService(engine)
        user = auth.get_user_by_username(args.username)
        portability = DataPortabilityService(engine)
        entities = collect_legacy_entities(args.calendar_db, args.memory_db, args.fridge_json)
        backup = {
            "formatVersion": BACKUP_FORMAT_VERSION,
            "exportedAt": "legacy-import",
            "entities": entities,
            "checksum": checksum_entities(entities),
        }
        before = portability.export(user.id)
        result = portability.import_backup(
            user.id,
            backup,
            mode="merge",
            source="legacy-sqlite-json",
        )
        return {
            "username": user.username,
            "sources": {
                "calendar": str(args.calendar_db),
                "memory": str(args.memory_db),
                "fridge": str(args.fridge_json),
            },
            "duplicateImport": bool(result.get("skipped")),
            "entities": _report(entities, before, bool(result.get("skipped"))),
        }
    finally:
        engine.dispose()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import legacy Calendar App data into one account.")
    parser.add_argument("--username", required=True)
    parser.add_argument("--database-url", help="Target SQLAlchemy URL; defaults to CALENDAR_DATABASE_URL.")
    parser.add_argument("--calendar-db", type=Path, default=DEFAULT_CALENDAR_DB)
    parser.add_argument("--memory-db", type=Path, default=DEFAULT_MEMORY_DB)
    parser.add_argument("--fridge-json", type=Path, default=DEFAULT_FRIDGE_JSON)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        args.database_url = require_legacy_import_database_url(args.database_url)
    except LegacyImportConfigurationError as error:
        print(f'Error: {error}', file=sys.stderr)
        return 2
    try:
        report = migrate(args)
    except (
        AuthError,
        OSError,
        RuntimeError,
        sqlite3.DatabaseError,
        json.JSONDecodeError,
        ValueError,
    ) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"ok": True, "report": report}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
