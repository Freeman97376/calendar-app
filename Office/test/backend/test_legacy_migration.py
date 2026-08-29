from __future__ import annotations

import argparse
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from backend.auth import AuthService
from backend.database import create_database_engine
from backend.desktop_migration import _alembic_upgrade
from backend.migrate_legacy import migrate


class LegacyMigrationTests(unittest.TestCase):
    def test_sqlite_and_json_import_is_scoped_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target_url = f"sqlite:///{(root / 'target.sqlite3').as_posix()}"
            _alembic_upgrade(target_url)
            engine = create_database_engine(target_url)
            owner = AuthService(engine).create_user("legacy_owner", "legacy-owner-password", admin=True)
            engine.dispose()

            calendar = root / "calendar.sqlite3"
            with closing(sqlite3.connect(calendar)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE event_types (id TEXT, label TEXT, color TEXT, applies_to TEXT, is_archived INTEGER, created_at TEXT, updated_at TEXT);
                    CREATE TABLE todos (id TEXT, title TEXT, notes TEXT, status TEXT, event_type_id TEXT, due_date TEXT, linked_event_id TEXT, long_project_json TEXT, eta_minutes INTEGER, energy_needed TEXT, priority TEXT, created_at TEXT, updated_at TEXT, completed_at TEXT);
                    CREATE TABLE events (id TEXT, title TEXT, description TEXT, display_details TEXT, start_at TEXT, end_at TEXT, all_day INTEGER, color TEXT, event_type_id TEXT, linked_todo_id TEXT, recurrence_rule_json TEXT, master_id TEXT, exception_for TEXT, exception_date TEXT, deleted_occurrences_json TEXT, sync_status TEXT, created_at TEXT, updated_at TEXT);
                    CREATE TABLE planning_runs (id TEXT, summary TEXT, input_json TEXT, output_json TEXT, created_at TEXT);
                    INSERT INTO event_types VALUES ('general', 'General', '#047857', 'both', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
                    INSERT INTO todos VALUES ('legacy-todo', 'Imported todo', '', 'todo', 'general', NULL, NULL, NULL, 30, 'medium', 'medium', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL);
                    INSERT INTO events VALUES ('legacy-event', 'Imported event', '', NULL, '2026-07-13T10:00:00Z', '2026-07-13T11:00:00Z', 0, NULL, 'general', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
                    """
                )

            memory = root / "memory.sqlite3"
            with closing(sqlite3.connect(memory)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE goals (goal_id TEXT, title TEXT, description TEXT, status TEXT, metadata_json TEXT, created_at TEXT, updated_at TEXT);
                    INSERT INTO goals VALUES ('legacy-goal', 'Imported goal', '', 'active', '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
                    """
                )

            fridge = root / "fridge.json"
            fridge.write_text(json.dumps({"items": [{
                "item_id": "legacy-milk", "item_name": "Milk", "purchase_date": "2026-07-13",
                "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
            }]}), encoding="utf-8")
            args = argparse.Namespace(
                username="legacy_owner", database_url=target_url, calendar_db=calendar,
                memory_db=memory, fridge_json=fridge,
            )
            first = migrate(args)
            second = migrate(args)
            self.assertFalse(first["duplicateImport"])
            self.assertTrue(second["duplicateImport"])
            self.assertEqual(first["entities"]["todos"]["created"], 1)
            self.assertEqual(second["entities"]["todos"]["skipped"], 1)

            target = create_database_engine(target_url)
            try:
                from backend.calendar import CalendarRepository
                from backend.user_data import DataPortabilityService

                self.assertEqual(CalendarRepository(engine=target).list_todos(owner["id"])[0]["id"], "legacy-todo")
                exported = DataPortabilityService(target).export(owner["id"])["entities"]
                self.assertEqual(exported["goals"][0]["goal_id"], "legacy-goal")
                self.assertEqual(exported["fridgeItems"][0]["item_id"], "legacy-milk")
            finally:
                target.dispose()


if __name__ == "__main__":
    unittest.main()
