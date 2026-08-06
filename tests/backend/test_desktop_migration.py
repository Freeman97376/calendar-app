from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from backend.database import ALEMBIC_HEAD
from backend.desktop_migration import (
    DesktopMigrationError,
    _alembic_upgrade,
    prepare_desktop_database,
)


NOW = "2026-07-19T00:00:00Z"


def database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def revision(path: Path) -> str:
    with closing(sqlite3.connect(path)) as connection:
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    assert row is not None
    return str(row[0])


class DesktopMigrationTests(unittest.TestCase):
    def test_fresh_database_is_fully_migrated(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "fresh.sqlite3"

            result = prepare_desktop_database(database_url(path))

            self.assertEqual(revision(path), ALEMBIC_HEAD)
            self.assertIsNone(result["backupPath"])
            with closing(sqlite3.connect(path)) as connection:
                self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone(), ("ok",))
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_unmarked_0006_layout_is_detected_and_upgraded(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "unmarked.sqlite3"
            _alembic_upgrade(database_url(path), "20260715_0006")
            with closing(sqlite3.connect(path)) as connection:
                connection.execute("DROP TABLE alembic_version")
                connection.commit()

            prepare_desktop_database(database_url(path))

            self.assertEqual(revision(path), ALEMBIC_HEAD)

    def test_false_0007_stamp_repairs_project_goal_and_installs_constraint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "false-0007.sqlite3"
            _alembic_upgrade(database_url(path), "20260715_0006")
            with closing(sqlite3.connect(path)) as connection:
                connection.executemany(
                    """
                    INSERT INTO goals
                        (goal_id, user_id, title, description, status, metadata_json, created_at, updated_at)
                    VALUES (?, 'local', ?, '', 'active', '{}', ?, ?)
                    """,
                    (("goal-a", "Goal A", NOW, NOW), ("goal-b", "Goal B", NOW, NOW)),
                )
                connection.execute(
                    """
                    INSERT INTO projects
                        (project_id, user_id, goal_id, title, description, status, metadata_json, created_at, updated_at)
                    VALUES ('project-a', 'local', 'goal-a', 'Project', '', 'active', '{}', ?, ?)
                    """,
                    (NOW, NOW),
                )
                connection.execute(
                    """
                    INSERT INTO conversation_threads
                        (thread_id, user_id, kind, title, goal_id, project_id, template_id, status,
                         rolling_summary, summary_through_message_id, metadata_json, created_at, updated_at)
                    VALUES ('thread-a', 'local', 'goal_draft', 'Thread', 'goal-b', 'project-a', NULL,
                            'draft', '', NULL, '{}', ?, ?)
                    """,
                    (NOW, NOW),
                )
                connection.execute("UPDATE alembic_version SET version_num = '20260715_0007'")
                connection.commit()

            result = prepare_desktop_database(database_url(path))

            self.assertEqual(revision(path), ALEMBIC_HEAD)
            backup_path = Path(str(result["backupPath"]))
            checksum = sha256(backup_path)
            self.assertEqual(
                backup_path.with_suffix(f"{backup_path.suffix}.sha256").read_text(encoding="utf-8"),
                f"{checksum}  {backup_path.name}\n",
            )
            with closing(sqlite3.connect(backup_path)) as backup:
                self.assertEqual(revision(backup_path), "20260715_0007")
                self.assertEqual(backup.execute("SELECT goal_id FROM conversation_threads WHERE thread_id = 'thread-a'").fetchone(), ("goal-b",))
            with closing(sqlite3.connect(path)) as connection:
                connection.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(
                    connection.execute(
                        "SELECT goal_id FROM conversation_threads WHERE thread_id = 'thread-a'"
                    ).fetchone(),
                    ("goal-a",),
                )
                self.assertEqual(
                    connection.execute(
                        """
                        SELECT previous_value, repaired_value
                        FROM data_integrity_repairs
                        WHERE source_table = 'conversation_threads' AND external_id = 'thread-a'
                        """
                    ).fetchone(),
                    ("goal-b", "goal-a"),
                )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        """
                        INSERT INTO conversation_threads
                            (thread_id, user_id, kind, title, goal_id, project_id, template_id, status,
                             rolling_summary, summary_through_message_id, metadata_json, created_at, updated_at)
                        VALUES ('thread-b', 'local', 'goal_draft', 'Mismatch', 'goal-b', 'project-a', NULL,
                                'draft', '', NULL, '{}', ?, ?)
                        """,
                        (NOW, NOW),
                    )

    def test_correct_0007_and_current_head_are_accepted(self) -> None:
        for target in ("20260715_0007", ALEMBIC_HEAD):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as temp_dir:
                path = Path(temp_dir) / "known.sqlite3"
                _alembic_upgrade(database_url(path), target)

                prepare_desktop_database(database_url(path))

                self.assertEqual(revision(path), ALEMBIC_HEAD)

    def test_unknown_layout_is_rejected_without_changing_original(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "unknown.sqlite3"
            with closing(sqlite3.connect(path)) as connection:
                connection.execute("CREATE TABLE mystery (id INTEGER PRIMARY KEY, value TEXT)")
                connection.execute("INSERT INTO mystery (value) VALUES ('keep me')")
                connection.commit()
            original_hash = sha256(path)

            with self.assertRaises(DesktopMigrationError) as raised:
                prepare_desktop_database(database_url(path))

            self.assertEqual(sha256(path), original_hash)
            self.assertFalse(path.with_suffix(f"{path.suffix}.migration-candidate").exists())
            self.assertTrue(raised.exception.backup_path and raised.exception.backup_path.is_file())
            self.assertTrue(raised.exception.diagnostic_path and raised.exception.diagnostic_path.is_file())

    def test_corrupt_database_is_rejected_without_changing_original(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "corrupt.sqlite3"
            path.write_bytes(b"not a sqlite database")
            original_hash = sha256(path)

            with self.assertRaises(DesktopMigrationError):
                prepare_desktop_database(database_url(path))

            self.assertEqual(sha256(path), original_hash)

    def test_pyinstaller_bundle_includes_alembic_configuration(self) -> None:
        project_root = Path(__file__).resolve().parents[2]
        spec = (project_root / "calendar_backend.spec").read_text(encoding="utf-8")

        self.assertIn('(str(ROOT / "alembic.ini"), ".")', spec)


if __name__ == "__main__":
    unittest.main()
