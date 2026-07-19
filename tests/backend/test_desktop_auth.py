from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from backend.server import create_app


class DesktopAuthenticationTests(unittest.TestCase):
    def test_desktop_accepts_tauri_ai_preflight_with_authorization_header(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'desktop.sqlite3').as_posix()}"
            app = create_app(mode="desktop", configured_database_url=database_url, launch_token="launch-secret")
            try:
                client = TestClient(app)
                response = client.options(
                    "/api/ai/chat/completions",
                    headers={
                        "Origin": "http://tauri.localhost",
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "authorization,content-type,x-desktop-token",
                    },
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.headers.get("access-control-allow-origin"), "http://tauri.localhost")
                self.assertIn("Authorization", response.headers.get("access-control-allow-headers", ""))
            finally:
                app.state.calendar.engine.dispose()

    def test_ai_proxy_returns_structured_error_when_provider_is_unreachable(self) -> None:
        class UnreachableClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, *_args, **_kwargs):
                request = httpx.Request("POST", "https://api.deepseek.com/chat/completions")
                raise httpx.ConnectError("offline", request=request)

        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'desktop.sqlite3').as_posix()}"
            app = create_app(mode="desktop", configured_database_url=database_url, launch_token="launch-secret")
            try:
                client = TestClient(app)
                with (
                    patch("backend.server.local_ai_key", return_value="stored-key"),
                    patch("backend.server.httpx.AsyncClient", return_value=UnreachableClient()),
                ):
                    response = client.post(
                        "/api/ai/chat/completions",
                        headers={"X-Desktop-Token": "launch-secret"},
                        json={"messages": [{"role": "user", "content": "hello"}]},
                    )
                self.assertEqual(response.status_code, 502, response.text)
                self.assertEqual(response.json()["error"]["code"], "ai_upstream_unreachable")
                self.assertIn("could not reach the AI provider", response.json()["error"]["message"])
            finally:
                app.state.calendar.engine.dispose()

    def test_ai_proxy_validates_operation_upstream_envelope_and_truncation(self) -> None:
        class StaticClient:
            def __init__(self, response: httpx.Response, captured: list[dict]) -> None:
                self.response = response
                self.captured = captured

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, *_args, **kwargs):
                self.captured.append(kwargs["json"])
                return self.response

        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'desktop.sqlite3').as_posix()}"
            app = create_app(mode="desktop", configured_database_url=database_url, launch_token="launch-secret")
            try:
                client = TestClient(app)
                headers = {"X-Desktop-Token": "launch-secret"}
                with patch("backend.server.local_ai_key", return_value="stored-key"):
                    unknown = client.post(
                        "/api/ai/chat/completions",
                        headers=headers,
                        json={"_calendarOperation": "made-up", "messages": []},
                    )
                self.assertEqual(unknown.status_code, 422, unknown.text)
                self.assertEqual(unknown.json()["error"]["code"], "ai_operation_invalid")

                captured: list[dict] = []
                html_response = httpx.Response(
                    200,
                    content=b"<!doctype html><title>proxy error</title>",
                    headers={"Content-Type": "text/html"},
                )
                with (
                    patch("backend.server.local_ai_key", return_value="stored-key"),
                    patch("backend.server.httpx.AsyncClient", return_value=StaticClient(html_response, captured)),
                ):
                    invalid = client.post(
                        "/api/ai/chat/completions",
                        headers=headers,
                        json={"messages": [{"role": "user", "content": "hello"}]},
                    )
                self.assertEqual(invalid.status_code, 502, invalid.text)
                self.assertEqual(invalid.json()["error"]["code"], "ai_upstream_invalid_response")

                truncated_response = httpx.Response(
                    200,
                    json={
                        "choices": [{"finish_reason": "length", "message": {"content": '{"partial":'}}],
                        "usage": {"prompt_tokens": 12, "completion_tokens": 3000},
                    },
                )
                captured.clear()
                with (
                    patch.dict("os.environ", {"AI_PLANNING_MODEL": "planning-model"}),
                    patch("backend.server.local_ai_key", return_value="stored-key"),
                    patch("backend.server.httpx.AsyncClient", return_value=StaticClient(truncated_response, captured)),
                ):
                    truncated = client.post(
                        "/api/ai/chat/completions",
                        headers=headers,
                        json={
                            "_calendarOperation": "calendar_plan",
                            "max_tokens": 99999,
                            "messages": [{"role": "user", "content": "plan"}],
                        },
                    )
                self.assertEqual(truncated.status_code, 422, truncated.text)
                self.assertEqual(truncated.json()["error"]["code"], "ai_output_truncated")
                self.assertEqual(captured[0]["model"], "planning-model")
                self.assertEqual(captured[0]["max_tokens"], 3000)
            finally:
                app.state.calendar.engine.dispose()

    def test_bootstrap_requires_the_ephemeral_launch_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'desktop.sqlite3').as_posix()}"
            app = create_app(
                mode="desktop",
                configured_database_url=database_url,
                launch_token="launch-secret",
            )
            try:
                client = TestClient(app)
                self.assertEqual(client.get("/api/bootstrap").status_code, 401)
                response = client.get(
                    "/api/bootstrap",
                    headers={"X-Desktop-Token": "launch-secret"},
                )
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()["authRequired"])
                self.assertEqual(response.json()["user"]["id"], "local")
            finally:
                app.state.calendar.engine.dispose()

    def test_desktop_can_edit_local_ai_budget(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'desktop.sqlite3').as_posix()}"
            app = create_app(mode="desktop", configured_database_url=database_url, launch_token="launch-secret")
            try:
                client = TestClient(app)
                headers = {"X-Desktop-Token": "launch-secret"}
                response = client.patch(
                    "/api/me/preferences",
                    headers=headers,
                    json={"aiMonthlySoftLimit": 2_000_000, "aiMonthlyHardLimit": 3_000_000},
                )
                self.assertEqual(response.status_code, 200, response.text)
                usage = client.get("/api/me/ai-usage", headers=headers).json()["usage"]
                self.assertEqual(usage["soft_limit"], 2_000_000)
                self.assertEqual(usage["hard_limit"], 3_000_000)
                with app.state.calendar.engine.connect() as connection:
                    revision = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
                self.assertEqual(revision, "20260715_0007")
            finally:
                app.state.calendar.engine.dispose()


if __name__ == "__main__":
    unittest.main()
