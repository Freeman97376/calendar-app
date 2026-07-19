from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from fastapi.testclient import TestClient

from backend.server import create_app
from backend.update_backup import PreUpdateBackupError, create_pre_update_backup


class DesktopUpdateBackupTests(unittest.TestCase):
    def test_authenticated_desktop_endpoint_creates_a_readable_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "desktop.sqlite3"
            app = create_app(
                mode="desktop",
                configured_database_url=f"sqlite:///{database_path.as_posix()}",
                launch_token="launch-secret",
            )
            try:
                response = TestClient(app).post(
                    "/api/data/pre-update-backup",
                    headers={"X-Desktop-Token": "launch-secret"},
                    json={"fromVersion": "0.2.0", "toVersion": "0.2.1"},
                )
                self.assertEqual(response.status_code, 200, response.text)
                metadata = response.json()["backup"]
                snapshot = database_path.parent / "backups" / metadata["fileName"]
                checksum_file = snapshot.with_suffix(f"{snapshot.suffix}.sha256")
                self.assertTrue(snapshot.is_file())
                self.assertTrue(checksum_file.is_file())
                self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), metadata["checksum"])
                with closing(sqlite3.connect(snapshot)) as connection:
                    revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()
                self.assertEqual(revision, ("20260715_0007",))
            finally:
                app.state.calendar.engine.dispose()

    def test_backup_rotation_keeps_only_the_three_newest_snapshots(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "desktop.sqlite3"
            app = create_app(
                mode="desktop",
                configured_database_url=f"sqlite:///{database_path.as_posix()}",
                launch_token="launch-secret",
            )
            try:
                for patch in range(1, 5):
                    create_pre_update_backup(
                        app.state.calendar.engine,
                        from_version="0.2.0",
                        to_version=f"0.2.{patch}",
                    )
                backup_dir = database_path.parent / "backups"
                snapshots = list(backup_dir.glob("pre-update-*.sqlite3"))
                checksums = list(backup_dir.glob("pre-update-*.sqlite3.sha256"))
                self.assertEqual(len(snapshots), 3)
                self.assertEqual(len(checksums), 3)
            finally:
                app.state.calendar.engine.dispose()

    def test_invalid_versions_are_rejected_before_writing_a_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "desktop.sqlite3"
            app = create_app(
                mode="desktop",
                configured_database_url=f"sqlite:///{database_path.as_posix()}",
                launch_token="launch-secret",
            )
            try:
                with self.assertRaises(PreUpdateBackupError):
                    create_pre_update_backup(
                        app.state.calendar.engine,
                        from_version="0.2.0/../../escape",
                        to_version="0.2.1",
                    )
                self.assertFalse((database_path.parent / "backups").exists())
            finally:
                app.state.calendar.engine.dispose()


if __name__ == "__main__":
    unittest.main()
