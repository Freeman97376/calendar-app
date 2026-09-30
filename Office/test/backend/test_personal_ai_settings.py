from __future__ import annotations

import base64
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from sqlalchemy import select
from backend.database import UserAISettingRecord, create_session_factory
from backend.personal_ai import PersonalAIService

from fastapi.testclient import TestClient
import httpx

from backend.desktop_migration import _alembic_upgrade
from backend.server import create_app


class PersonalAISettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = f"sqlite:///{(Path(self.temp.name) / 'test.sqlite3').as_posix()}"
        self.env = patch.dict(os.environ, {
            "CALENDAR_ALLOW_SERVER_SQLITE": "true", "CALENDAR_COOKIE_SECURE": "false",
            "DEEPSEEK_API_KEY": "", "CALENDAR_AI_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"0" * 32).decode(),
        })
        self.env.start()
        _alembic_upgrade(self.url)
        self.app = create_app(mode="server", configured_database_url=self.url)
        for name in ("alice", "bob"):
            self.app.state.calendar.auth.create_user(name, f"{name}-password-123")
        self.alice, self.alice_headers = self.login("alice")
        self.bob, self.bob_headers = self.login("bob")

    def tearDown(self):
        self.alice.close()
        self.bob.close()
        self.app.state.calendar.engine.dispose()
        self.env.stop()
        self.temp.cleanup()

    def login(self, name):
        client = TestClient(self.app)
        response = client.post("/api/auth/login", json={"username": name, "password": f"{name}-password-123"})
        self.assertEqual(response.status_code, 200)
        return client, {"X-CSRF-Token": response.json()["csrfToken"]}

    def save(self, key="synthetic-alice-key", **values):
        return self.alice.patch("/api/ai/settings", headers=self.alice_headers, json={"apiKey": key, **values})

    def test_save_is_private_persistent_and_account_scoped(self):
        response = self.save()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["personalKeyConfigured"])
        self.assertNotIn("synthetic-alice-key", response.text)
        self.assertTrue(self.alice.get("/api/ai/settings").json()["personalKeyConfigured"])
        self.assertFalse(self.bob.get("/api/ai/settings").json()["personalKeyConfigured"])
        self.assertNotIn("synthetic-alice-key", self.alice.get("/api/bootstrap").text)
        self.assertTrue(self.alice.get("/api/config").json()["deepseek"]["configured"])

    def test_requires_login_and_csrf(self):
        with TestClient(self.app) as anonymous:
            self.assertEqual(anonymous.get("/api/ai/settings").status_code, 401)
        self.assertEqual(self.alice.patch("/api/ai/settings", json={"apiKey": "synthetic-key"}).status_code, 403)
        self.assertEqual(self.alice.delete("/api/ai/settings").status_code, 403)

    def service(self, client=None):
        user_id = (client or self.alice).get("/api/auth/me").json()["user"]["id"]
        return PersonalAIService(self.app.state.calendar.engine, user_id)

    def test_validation_does_not_echo_or_overwrite_secrets(self):
        self.assertEqual(self.save().status_code, 200)
        for key in [123, {}, [], "bad key", "bad" + chr(10) + "key", "bad" + chr(0x200b) + "key", "x" * 513]:
            response = self.save(key)
            self.assertEqual(response.status_code, 422, response.text)
            if isinstance(key, str): self.assertNotIn(key, response.text)
        for values in ({"userId": "bob"}, {"baseUrl": "http://127.0.0.1"}, {"routineModel": "unknown"}):
            self.assertEqual(self.save(**values).status_code, 422)
        self.assertEqual(self.service().resolve().api_key, "synthetic-alice-key")

    def test_ciphertext_and_exports_never_contain_plaintext(self):
        self.assertEqual(self.save().status_code, 200)
        with create_session_factory(self.app.state.calendar.engine)() as session:
            row = session.scalar(select(UserAISettingRecord))
            self.assertNotIn("synthetic-alice-key", row.encrypted_api_key)
            self.assertTrue(row.encrypted_api_key.startswith("gAAAA"))
        exported = self.alice.get("/api/data/export")
        self.assertEqual(exported.status_code, 200)
        for private in ("synthetic-alice-key", "encrypted_api_key", "user_ai_settings"):
            self.assertNotIn(private, exported.text)
        self.assertEqual(self.alice.get("/api/ai/settings").headers["cache-control"], "no-store")
        reopened = create_app(mode="server", configured_database_url=self.url)
        try:
            self.assertEqual(PersonalAIService(reopened.state.calendar.engine, self.service().user_id).resolve().api_key, "synthetic-alice-key")
        finally: reopened.state.calendar.engine.dispose()

    def test_blank_keeps_existing_key_replace_and_remove(self):
        self.assertEqual(self.save("").status_code, 422)
        self.assertEqual(self.save().status_code, 200)
        changed = self.save("", routineModel="deepseek-reasoner")
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["routineModel"], "deepseek-reasoner")
        self.assertEqual(self.save("replacement-synthetic-key").status_code, 200)
        self.assertEqual(self.service().resolve().api_key, "replacement-synthetic-key")
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "shared-synthetic-key"}):
            removed = self.alice.delete("/api/ai/settings", headers=self.alice_headers)
            self.assertEqual(removed.json()["source"], "server")
            self.assertFalse(removed.json()["personalKeyConfigured"])
        self.assertEqual(self.alice.get("/api/ai/settings").json()["source"], "none")

    def test_provider_requests_use_current_accounts_key_and_models(self):
        self.assertEqual(self.save(planningModel="deepseek-reasoner").status_code, 200)
        self.assertEqual(self.bob.patch("/api/ai/settings", headers=self.bob_headers, json={"apiKey": "synthetic-bob-key"}).status_code, 200)
        upstream_payload = {"choices": [{"message": {"content": "synthetic reply"}}], "usage": {"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4}}
        upstream = httpx.Response(200, json=upstream_payload)
        fake = AsyncMock()
        fake.post.return_value = upstream
        with patch("backend.server.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = fake
            for client, headers, key, operation, model in [
                (self.alice, self.alice_headers, "synthetic-alice-key", "goal_plan", "deepseek-reasoner"),
                (self.bob, self.bob_headers, "synthetic-bob-key", "routine", "deepseek-chat"),
            ]:
                response = client.post("/api/ai/chat/completions", headers=headers, json={"messages": [{"role": "user", "content": "synthetic"}], "_calendarOperation": operation})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(fake.post.call_args.args[0], "https://api.deepseek.com/chat/completions")
                self.assertEqual(fake.post.call_args.kwargs["headers"]["Authorization"], "Bearer " + key)
                self.assertEqual(fake.post.call_args.kwargs["json"]["model"], model)
                self.assertEqual(fake.post.call_args.kwargs["json"]["max_tokens"], 16384 if operation == "goal_plan" else 800)
                self.assertNotIn(key, response.text)

    def test_missing_or_wrong_encryption_key_fails_closed(self):
        self.assertEqual(self.save().status_code, 200)
        for key, code in [("", "ai_settings_unavailable"), (base64.urlsafe_b64encode(b"1" * 32).decode(), "ai_key_unavailable")]:
            with patch.dict(os.environ, {"CALENDAR_AI_ENCRYPTION_KEY": key, "DEEPSEEK_API_KEY": "shared-synthetic-key"}):
                response = self.alice.post("/api/ai/chat/completions", headers=self.alice_headers, json={"messages": []})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["error"]["code"], code)
        with patch.dict(os.environ, {"CALENDAR_AI_ENCRYPTION_KEY": ""}):
            self.assertFalse(self.alice.get("/api/ai/settings").json()["editable"])
            self.assertEqual(self.save().status_code, 503)

    def test_ciphertext_cannot_be_swapped_between_accounts(self):
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.bob.patch("/api/ai/settings", headers=self.bob_headers, json={"apiKey": "synthetic-bob-key"}).status_code, 200)
        with create_session_factory(self.app.state.calendar.engine)() as session:
            rows = session.scalars(select(UserAISettingRecord)).all()
            ciphertexts = [row.encrypted_api_key for row in rows]
            rows[0].encrypted_api_key, rows[1].encrypted_api_key = ciphertexts[::-1]
            session.commit()
        response = self.bob.post("/api/ai/chat/completions", headers=self.bob_headers, json={"messages": []})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "ai_key_unavailable")

    def test_receipt_fallback_uses_personal_key_without_shared_mutation(self):
        self.assertEqual(self.save().status_code, 200)
        state = self.app.state.calendar
        original = state.analyzer.deepseek_client
        with patch("backend.server.DeepSeekClient") as client_factory, patch.object(state.analyzer, "analyze", return_value={"success": True}):
            response = self.alice.post("/api/fridge/receipt/analyze", headers=self.alice_headers,
                files={"image": ("receipt.png", b"synthetic receipt bytes", "image/png")},
                data={"purchase_date": "2026-09-20", "timezone": "UTC"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(client_factory.call_args.args[0].api_key, "synthetic-alice-key")
            self.assertIs(state.analyzer.deepseek_client, original)


class PersonalAIMigrationTests(unittest.TestCase):
    def test_upgrade_preserves_existing_accounts_and_is_reversible(self):
        from alembic import command
        from alembic.config import Config
        from sqlalchemy import create_engine, inspect, text
        with tempfile.TemporaryDirectory() as folder:
            url = f"sqlite:///{(Path(folder) / 'migration.sqlite3').as_posix()}"
            root = Path(__file__).resolve().parents[3]
            config = Config(str(root / "alembic.ini"))
            config.set_main_option("script_location", str(root / "backend/calendar/migrations"))
            config.set_main_option("sqlalchemy.url", url)
            command.upgrade(config, "20260829_0011")
            engine = create_engine(url)
            with engine.connect() as connection:
                before = list(connection.execute(text("SELECT id, username, password_hash FROM users")))
            command.upgrade(config, "head")
            with engine.connect() as connection:
                self.assertEqual(list(connection.execute(text("SELECT id, username, password_hash FROM users"))), before)
                self.assertEqual(connection.execute(text("SELECT version_num FROM alembic_version")).scalar(), "20260920_0012")
            self.assertEqual(inspect(engine).get_pk_constraint("user_ai_settings")["constrained_columns"], ["user_id"])
            command.downgrade(config, "20260829_0011")
            self.assertNotIn("user_ai_settings", inspect(engine).get_table_names())
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
