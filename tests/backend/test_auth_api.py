from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.auth import AuthError, AuthService
from backend.database import SessionRecord, create_database_engine
from backend.server import create_app
from backend.user_data import checksum_entities


class AuthApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "server.sqlite3"
        self.url = f"sqlite:///{self.db_path.as_posix()}"
        self.env = patch.dict(
            "os.environ",
            {"CALENDAR_COOKIE_SECURE": "false", "CALENDAR_ALLOW_SERVER_SQLITE": "true"},
        )
        self.env.start()
        self.app = create_app(mode="server", configured_database_url=self.url)
        self.auth: AuthService = self.app.state.calendar.auth
        self.alice = self.auth.create_user("alice", "alice-password-123", admin=True)
        self.bob = self.auth.create_user("bob", "bob-password-123")

    def tearDown(self) -> None:
        self.app.state.calendar.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def login(self, username: str, password: str) -> tuple[TestClient, str]:
        client = TestClient(self.app)
        response = client.post("/api/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return client, response.json()["csrfToken"]

    def test_login_csrf_logout_and_no_registration_route(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        self.assertEqual(client.get("/api/auth/me").json()["user"]["username"], "alice")
        denied = client.post("/api/calendar/todos", json={"title": "No CSRF"})
        self.assertEqual(denied.status_code, 403)
        created = client.post(
            "/api/calendar/todos",
            headers={"X-CSRF-Token": csrf},
            json={"id": "todo-1", "title": "Protected task"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(client.post("/api/register", json={}).status_code, 404)
        self.assertEqual(
            client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}).status_code,
            200,
        )
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_two_users_can_reuse_ids_without_cross_account_access(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        for client, csrf, title in (
            (alice_client, alice_csrf, "Alice event"),
            (bob_client, bob_csrf, "Bob event"),
        ):
            response = client.post(
                "/api/calendar/events",
                headers={"X-CSRF-Token": csrf},
                json={
                    "id": "same-id",
                    "title": title,
                    "startAt": "2026-07-13T10:00:00.000Z",
                    "endAt": "2026-07-13T11:00:00.000Z",
                },
            )
            self.assertEqual(response.status_code, 200, response.text)

        alice_client.post(
            "/api/calendar/events",
            headers={"X-CSRF-Token": alice_csrf},
            json={
                "id": "alice-only",
                "title": "Private",
                "startAt": "2026-07-13T12:00:00.000Z",
                "endAt": "2026-07-13T13:00:00.000Z",
            },
        )
        alice_events = alice_client.get(
            "/api/calendar/events?start=2026-07-13T00:00:00.000Z&end=2026-07-13T23:59:59.999Z"
        ).json()["events"]
        bob_events = bob_client.get(
            "/api/calendar/events?start=2026-07-13T00:00:00.000Z&end=2026-07-13T23:59:59.999Z"
        ).json()["events"]
        self.assertEqual({item["title"] for item in alice_events}, {"Alice event", "Private"})
        self.assertEqual({item["title"] for item in bob_events}, {"Bob event"})
        cross_update = bob_client.patch(
            "/api/calendar/events/alice-only",
            headers={"X-CSRF-Token": bob_csrf},
            json={"title": "Stolen"},
        )
        self.assertEqual(cross_update.status_code, 404)

    def test_failed_logins_lock_and_cli_password_change_revokes_sessions(self) -> None:
        for _index in range(5):
            response = TestClient(self.app).post(
                "/api/auth/login",
                json={"username": "bob", "password": "wrong-password"},
            )
            self.assertEqual(response.status_code, 401)
        locked = TestClient(self.app).post(
            "/api/auth/login",
            json={"username": "bob", "password": "bob-password-123"},
        )
        self.assertEqual(locked.status_code, 423)
        self.auth.unlock("bob")
        client, _csrf = self.login("bob", "bob-password-123")
        self.auth.set_password("bob", "new-bob-password-123")
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_unknown_login_reuses_dummy_hash_and_applies_username_throttle(self) -> None:
        dummy_hash = self.auth._dummy_password_hash
        with patch.dict("os.environ", {"AUTH_LOGIN_USERNAME_MAX_ATTEMPTS": "1"}):
            first = TestClient(self.app).post(
                "/api/auth/login",
                json={"username": "missing-user", "password": "wrong-password"},
            )
            second = TestClient(self.app).post(
                "/api/auth/login",
                json={"username": "missing-user", "password": "wrong-password"},
            )
        self.assertEqual(first.status_code, 401, first.text)
        self.assertEqual(second.status_code, 429, second.text)
        self.assertGreaterEqual(int(second.headers["Retry-After"]), 1)
        self.assertEqual(second.json()["error"]["code"], "login_rate_limited")
        self.assertEqual(self.auth._dummy_password_hash, dummy_hash)

    def test_session_expiry_and_account_disable_revoke_access(self) -> None:
        expired_client, _csrf = self.login("bob", "bob-password-123")
        with self.auth.session_factory.begin() as session:
            record = session.scalar(select(SessionRecord).where(SessionRecord.user_id == self.bob["id"]))
            self.assertIsNotNone(record)
            record.expires_at = "2000-01-01T00:00:00Z"
        self.assertEqual(expired_client.get("/api/auth/me").status_code, 401)

        active_client, _csrf = self.login("bob", "bob-password-123")
        self.auth.set_active("bob", False)
        self.assertEqual(active_client.get("/api/auth/me").status_code, 401)
        disabled_login = TestClient(self.app).post(
            "/api/auth/login",
            json={"username": "bob", "password": "bob-password-123"},
        )
        self.assertEqual(disabled_login.status_code, 403)
        self.auth.set_active("bob", True)
        self.login("bob", "bob-password-123")

    def test_export_import_is_scoped_and_idempotent(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        alice_client.post(
            "/api/calendar/todos",
            headers={"X-CSRF-Token": alice_csrf},
            json={"id": "portable", "title": "Portable task"},
        )
        backup = alice_client.get("/api/data/export").json()["backup"]
        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        body = {"backup": backup, "mode": "merge", "source": "test-backup"}
        first = bob_client.post("/api/data/import", headers={"X-CSRF-Token": bob_csrf}, json=body)
        second = bob_client.post("/api/data/import", headers={"X-CSRF-Token": bob_csrf}, json=body)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertTrue(second.json()["report"]["skipped"])
        self.assertEqual(bob_client.get("/api/calendar/todos").json()["todos"][0]["title"], "Portable task")

    def test_server_enforces_ai_mode_and_budget_policy(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        allowed = client.patch("/api/me/preferences", headers=headers, json={"aiUsageMode": "economy"})
        self.assertEqual(allowed.status_code, 200, allowed.text)
        usage = client.get("/api/me/ai-usage").json()["usage"]
        self.assertEqual(usage["selected_mode"], "economy")
        denied_mode = client.patch("/api/me/preferences", headers=headers, json={"aiUsageMode": "quality"})
        self.assertEqual(denied_mode.status_code, 403)
        denied_budget = client.patch("/api/me/preferences", headers=headers, json={"aiMonthlyHardLimit": 3_000_000})
        self.assertEqual(denied_budget.status_code, 403)

    def test_backup_import_cannot_raise_server_budget(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        backup = client.get("/api/data/export").json()["backup"]
        backup["entities"]["preferences"]["aiMonthlySoftLimit"] = 8_000_000
        backup["entities"]["preferences"]["aiMonthlyHardLimit"] = 9_000_000
        backup["checksum"] = checksum_entities(backup["entities"])
        response = client.post(
            "/api/data/import",
            headers=headers,
            json={"backup": backup, "mode": "merge", "source": "budget-attack"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["report"]["ignoredPreferenceKeys"],
            ["aiMonthlyHardLimit", "aiMonthlySoftLimit"],
        )
        usage = client.get("/api/me/ai-usage").json()["usage"]
        self.assertEqual(usage["hard_limit"], 2_000_000)

    def test_replace_import_replays_the_same_backup(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        client.post(
            "/api/calendar/todos",
            headers=headers,
            json={"id": "replace-me", "title": "Restored task"},
        )
        backup = client.get("/api/data/export").json()["backup"]
        body = {"backup": backup, "mode": "replace", "replaceConfirmed": True, "source": "replace-test"}
        first = client.post("/api/data/import", headers=headers, json=body)
        self.assertEqual(first.status_code, 200, first.text)
        client.delete("/api/calendar/todos/replace-me", headers=headers)
        second = client.post("/api/data/import", headers=headers, json=body)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertTrue(second.json()["report"]["replayed"])
        self.assertEqual(client.get("/api/calendar/todos").json()["todos"][0]["title"], "Restored task")

    def test_goal_conversation_activation_and_dashboard_are_user_scoped(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        bob_client, _bob_csrf = self.login("bob", "bob-password-123")
        headers = {"X-CSRF-Token": alice_csrf}
        created = alice_client.post(
            "/api/goal-conversations",
            headers=headers,
            json={"thread_id": "private-thread", "title": "Private goal"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(bob_client.get("/api/goal-conversations/private-thread").status_code, 404)
        plan = {
            "title": "Private goal",
            "summary": "A measurable private plan.",
            "project_id": "private-project",
            "goal_id": "private-goal",
            "metrics": [{"name": "Completion", "role": "leading", "unit": "%", "direction": "increase", "target_value": 80}],
            "milestones": [{"title": "First milestone"}],
            "actions": [{"title": "First action", "due_date": "2026-08-01", "estimated_minutes": 30, "execution_tier": "standard"}],
            "policy": {"weekly_capacity_minutes": 120, "active_tier": "standard"},
        }
        activated = alice_client.post(
            "/api/goal-conversations/private-thread/activate",
            headers=headers,
            json=plan,
        )
        self.assertEqual(activated.status_code, 200, activated.text)
        dashboard = alice_client.get("/api/memory/projects/private-project/dashboard")
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertEqual(dashboard.json()["dashboard"]["actions"][0]["estimated_minutes"], 30)
        self.assertEqual(bob_client.get("/api/memory/projects/private-project/dashboard").status_code, 404)


if __name__ == "__main__":
    unittest.main()
