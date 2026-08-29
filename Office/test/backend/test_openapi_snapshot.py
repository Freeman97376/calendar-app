from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.server import create_app


ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "openapi" / "calendar-app.openapi.json"


class OpenApiSnapshotTest(unittest.TestCase):
    def test_checked_in_openapi_snapshot_matches_routes_and_dtos(self) -> None:
        with tempfile.TemporaryDirectory(prefix="calendar-openapi-test-") as raw_directory:
            database_path = Path(raw_directory) / "calendar.sqlite3"
            app = create_app(
                mode="desktop",
                configured_database_url=f"sqlite:///{database_path.as_posix()}",
                launch_token="openapi-test",
            )
            expected = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
            self.assertEqual(expected, app.openapi())


if __name__ == "__main__":
    unittest.main()
