from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import text

from backend.audit_integrity import audit
from backend.database import create_database_engine, initialize_schema


class IntegrityAuditTests(unittest.TestCase):
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
