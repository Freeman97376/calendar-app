from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.server import create_app


class RequestLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "limits.sqlite3"
        self.env = patch.dict(
            "os.environ",
            {
                "CALENDAR_ALLOW_SERVER_SQLITE": "true",
                "CALENDAR_COOKIE_SECURE": "false",
                "CALENDAR_LOGIN_MAX_REQUEST_BYTES": "512",
                "CALENDAR_JSON_MAX_REQUEST_BYTES": "1024",
                "AI_MAX_REQUEST_BYTES": "512",
                "CALENDAR_BACKUP_MAX_REQUEST_BYTES": "4096",
                "CALENDAR_RECEIPT_MAX_FILE_BYTES": "1024",
                "CALENDAR_MULTIPART_MAX_REQUEST_BYTES": "2048",
            },
        )
        self.env.start()
        self.app = create_app(
            mode="server",
            configured_database_url=f"sqlite:///{db_path.as_posix()}",
        )
        self.app.state.calendar.auth.create_user("alice", "alice-password-123")
        self.client = TestClient(self.app)
        response = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "alice-password-123"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.csrf = response.json()["csrfToken"]

    def tearDown(self) -> None:
        self.app.state.calendar.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def test_content_length_and_chunked_login_limits(self) -> None:
        declared = TestClient(self.app).post(
            "/api/auth/login",
            content=b"x" * 513,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(declared.status_code, 413)
        self.assertEqual(declared.json()["error"]["code"], "login_request_too_large")

        def chunks():
            yield b'{"username":"missing","password":"'
            yield b"x" * 600
            yield b'"}'

        chunked = TestClient(self.app).post(
            "/api/auth/login",
            content=chunks(),
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(chunked.status_code, 413)
        self.assertEqual(chunked.json()["error"]["code"], "login_request_too_large")

    def test_json_ai_and_backup_path_limits(self) -> None:
        headers = {"X-CSRF-Token": self.csrf}
        ordinary = self.client.post(
            "/api/calendar/todos",
            headers=headers,
            json={"title": "x" * 1200},
        )
        self.assertEqual(ordinary.status_code, 413)
        self.assertEqual(ordinary.json()["error"]["code"], "request_too_large")

        ai = self.client.post(
            "/api/ai/chat/completions",
            headers=headers,
            json={"messages": [{"role": "user", "content": "x" * 600}]},
        )
        self.assertEqual(ai.status_code, 413)
        self.assertEqual(ai.json()["error"]["code"], "ai_request_too_large")

        backup = self.client.post(
            "/api/data/import",
            headers=headers,
            json={"backup": {"padding": "x" * 4200}},
        )
        self.assertEqual(backup.status_code, 413)
        self.assertEqual(backup.json()["error"]["code"], "backup_request_too_large")

    def test_receipt_file_and_total_multipart_limits(self) -> None:
        headers = {"X-CSRF-Token": self.csrf}
        file_limit = self.client.post(
            "/api/fridge/receipt/analyze",
            headers=headers,
            files={"image": ("receipt.png", b"x" * 1100, "image/png")},
        )
        self.assertEqual(file_limit.status_code, 413, file_limit.text)
        self.assertEqual(file_limit.json()["error"]["code"], "receipt_file_too_large")

        total_limit = self.client.post(
            "/api/fridge/receipt/analyze",
            headers=headers,
            files={"image": ("receipt.png", b"x" * 1900, "image/png")},
            data={"timezone": "Pacific/Honolulu"},
        )
        self.assertEqual(total_limit.status_code, 413, total_limit.text)
        self.assertEqual(total_limit.json()["error"]["code"], "multipart_request_too_large")

    def test_invalid_limit_configuration_fails_startup(self) -> None:
        self.app.state.calendar.engine.dispose()
        with patch.dict(
            "os.environ",
            {"CALENDAR_RECEIPT_MAX_FILE_BYTES": "3000", "CALENDAR_MULTIPART_MAX_REQUEST_BYTES": "2000"},
        ):
            with self.assertRaisesRegex(RuntimeError, "cannot exceed"):
                create_app(
                    mode="server",
                    configured_database_url="sqlite:///:memory:",
                )


if __name__ == "__main__":
    unittest.main()
