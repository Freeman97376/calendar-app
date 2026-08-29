from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import text

from backend.audit_integrity import audit
from backend.database import create_database_engine, initialize_schema


class IntegrityAuditTests(unittest.TestCase):
    def test_nullable_calendar_orphans_are_cleared_without_deleting_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / 'calendar-integrity.sqlite3'
            database_url = 'sqlite:///' + database_path.as_posix()
            engine = create_database_engine(database_url)
            initialize_schema(engine)
            with engine.begin() as connection:
                connection.execute(
                    text(
                        '''
                        INSERT INTO todos
                            (id, user_id, title, status, event_type_id, linked_event_id,
                             eta_minutes, energy_needed, priority, created_at, updated_at)
                        VALUES
                            ('orphan-todo', 'alice', 'Orphan todo', 'todo', 'general',
                             'missing-event', 30, 'medium', 'medium', :now, :now)
                        '''
                    ),
                    {'now': '2026-07-15T00:00:00Z'},
                )
                connection.execute(
                    text(
                        '''
                        INSERT INTO events
                            (id, user_id, title, start_at, end_at, all_day, event_type_id,
                             linked_todo_id, master_id, exception_for, sync_status,
                             created_at, updated_at)
                        VALUES
                            ('orphan-event', 'alice', 'Orphan event', :now, :now, 0,
                             'general', 'missing-todo', 'missing-master',
                             'missing-exception', 'pending', :now, :now)
                        '''
                    ),
                    {'now': '2026-07-15T00:00:00Z'},
                )
            engine.dispose()

            report = audit(database_url, repair=False)
            self.assertFalse(report['valid'])
            self.assertEqual(report['remainingIssueCount'], 2)

            repaired = audit(database_url, repair=True)
            self.assertTrue(repaired['valid'])
            self.assertEqual(repaired['repairedCount'], 4)
            self.assertEqual(repaired['archivedCount'], 0)

            checked = create_database_engine(database_url)
            with checked.connect() as connection:
                todo = connection.execute(
                    text('SELECT linked_event_id FROM todos WHERE user_id=:user_id AND id=:id'),
                    {'user_id': 'alice', 'id': 'orphan-todo'},
                ).one()
                event = connection.execute(
                    text(
                        'SELECT linked_todo_id, master_id, exception_for '
                        'FROM events WHERE user_id=:user_id AND id=:id'
                    ),
                    {'user_id': 'alice', 'id': 'orphan-event'},
                ).one()
                quarantine_count = connection.execute(
                    text('SELECT COUNT(*) FROM data_integrity_quarantine')
                ).scalar_one()
            checked.dispose()
            self.assertEqual(todo, (None,))
            self.assertEqual(event, (None, None, None))
            self.assertEqual(quarantine_count, 0)

    def test_orphan_is_reported_then_archived_before_removal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'integrity.sqlite3').as_posix()}"
            engine = create_database_engine(database_url)
            initialize_schema(engine)
            with engine.connect() as connection:
                connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
                connection.execute(
                    text(
                        """
                        INSERT INTO projects
                            (project_id, user_id, goal_id, title, description, status, metadata_json, created_at, updated_at)
                        VALUES
                            ('orphan-project', 'owner', 'missing-goal', 'Orphan', '', 'active', '{}', :now, :now)
                        """
                    ),
                    {"now": "2026-07-15T00:00:00Z"},
                )
                connection.commit()
            engine.dispose()

            report = audit(database_url, repair=False)
            self.assertFalse(report["valid"])
            self.assertEqual(report["remainingIssueCount"], 1)
            self.assertIn("projects", report["issues"][0]["table"])

            repaired = audit(database_url, repair=True)
            self.assertTrue(repaired["valid"])
            self.assertEqual(repaired["archivedCount"], 1)
            self.assertEqual(repaired["remainingIssueCount"], 0)

            checked = create_database_engine(database_url)
            with checked.connect() as connection:
                self.assertEqual(connection.exec_driver_sql("SELECT COUNT(*) FROM projects").scalar_one(), 0)
                self.assertEqual(connection.exec_driver_sql("SELECT COUNT(*) FROM data_integrity_quarantine").scalar_one(), 1)
            checked.dispose()
