from __future__ import annotations

import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from Office.test.backend import test_auth_api as auth_fixtures
from backend.database import EventTypeRecord, UserPreferenceRecord, UserRecord


class InviteRegistrationTests(unittest.TestCase):
    setUp = auth_fixtures.AuthApiTests.setUp
    tearDown = auth_fixtures.AuthApiTests.tearDown
    login = auth_fixtures.AuthApiTests.login

    def register(self, username="new-user", code="test-shared-invite", **extra):
        return TestClient(self.app).post("/api/auth/register", json={
            "username": username, "password": "synthetic-password-123",
            "inviteCode": code, **extra,
        })

    def test_disabled_by_default_and_desktop(self):
        with patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": ""}):
            self.assertFalse(TestClient(self.app).get("/api/bootstrap").json()["capabilities"]["registration"])
            self.assertEqual(self.register().status_code, 403)
        with patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"}):
            with patch.object(self.app.state.calendar, "mode", "desktop"):
                self.assertFalse(TestClient(self.app).get("/api/bootstrap").json()["capabilities"]["registration"])
                self.assertEqual(self.register().status_code, 403)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_shared_code_reusable_and_users_can_login_with_isolated_data(self):
        bootstrap = TestClient(self.app).get("/api/bootstrap")
        self.assertTrue(bootstrap.json()["capabilities"]["registration"])
        self.assertNotIn("test-shared-invite", bootstrap.text)
        responses = [self.register("new-one"), self.register("new-two")]
        for response in responses:
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()["user"]["role"], "user")
            self.assertNotIn("set-cookie", response.headers)
            self.assertNotIn("password", response.text)
            self.assertNotIn("test-shared-invite", response.text)
        one, csrf = self.login("new-one", "synthetic-password-123")
        two, _ = self.login("new-two", "synthetic-password-123")
        created = one.post("/api/memory/goal-projects", headers={"X-CSRF-Token": csrf}, json={
            "goal": {"title": "Private goal"}, "project": {"title": "Private project"},
        })
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(two.get("/api/memory/goals").json()["goals"], [])
        with self.auth.session_factory() as session:
            users = list(session.scalars(select(UserRecord).where(UserRecord.username.in_(["new-one", "new-two"]))))
            self.assertEqual(len(users), 2)
            for user in users:
                self.assertTrue(self.auth.password_hasher.verify(user.password_hash, "synthetic-password-123"))
                self.assertIsNotNone(session.scalar(select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == user.id)))
                self.assertIsNotNone(session.scalar(select(EventTypeRecord).where(EventTypeRecord.user_id == user.id)))

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_wrong_code_and_rotation_do_not_change_existing_accounts(self):
        self.assertEqual(self.register(code="wrong").status_code, 403)
        self.assertEqual(self.register().status_code, 201)
        with patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "rotated-code"}):
            self.assertEqual(self.register("later-user").status_code, 403)
            self.assertEqual(self.register("later-user", "rotated-code").status_code, 201)
        with patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": ""}):
            client, _ = self.login("new-user", "synthetic-password-123")
            self.assertEqual(client.get("/api/auth/me").status_code, 200)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_duplicate_normalized_username_returns_conflict(self):
        self.assertEqual(self.register(" New-User ").status_code, 201)
        self.assertEqual(self.register("new-user").status_code, 409)
        self.assertEqual(len([u for u in self.auth.list_users() if u["username"] == "new-user"]), 1)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite", "AUTH_REGISTER_IP_MAX_ATTEMPTS": "50", "AUTH_REGISTER_USERNAME_MAX_ATTEMPTS": "50"})
    def test_malformed_and_privilege_inputs_never_create_accounts_or_echo_secrets(self):
        cases = [
            {"role": "admin"}, {"admin": True}, {"password": "short"},
            {"username": "ｕser"}, {"username": "user\u200b"}, {"inviteCode": None},
            {"inviteCode": ""}, {"inviteCode": "x" * 257}, {"username": 123},
            {"password": "x" * 257},
        ]
        for change in cases:
            with self.subTest(change=change):
                response = self.register(**change)
                self.assertIn(response.status_code, (400, 422), response.text)
                self.assertNotIn("synthetic-password-123", response.text)
                self.assertNotIn("test-shared-invite", response.text)
        self.assertEqual(len(self.auth.list_users()), 2)
        malformed = TestClient(self.app).post("/api/auth/register", content='{bad json', headers={"Content-Type": "application/json"})
        self.assertEqual(malformed.status_code, 422)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite", "AUTH_REGISTER_IP_MAX_ATTEMPTS": "2"})
    def test_registration_throttle_persists_and_does_not_lock_login(self):
        for name in ["guess-one", "guess-two"]:
            self.assertEqual(self.register(name, "wrong").status_code, 403)
        blocked = self.register("guess-three")
        self.assertEqual(blocked.status_code, 429, blocked.text)
        self.assertGreater(int(blocked.headers["Retry-After"]), 0)
        client, _ = self.login("alice", "alice-password-123")
        self.assertEqual(client.get("/api/auth/me").status_code, 200)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_cross_origin_registration_rejected(self):
        response = TestClient(self.app).post("/api/auth/register", headers={"Origin": "https://untrusted.example", "Sec-Fetch-Site": "cross-site"}, json={"username": "new-user", "password": "synthetic-password-123", "inviteCode": "test-shared-invite"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(self.auth.list_users()), 2)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_concurrent_duplicate_registration_creates_one_account(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.register(), range(2)))
        self.assertEqual(sorted(r.status_code for r in results), [201, 409])
        self.assertEqual(len(self.auth.list_users()), 3)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_mid_transaction_failure_rolls_back_all_account_rows(self):
        def fail_after_flush(session, _context):
            if any(isinstance(row, UserRecord) and row.username == "new-user" for row in session.new):
                raise RuntimeError("synthetic account write failure")
        event.listen(Session, "after_flush", fail_after_flush)
        try:
            with self.assertRaisesRegex(RuntimeError, "synthetic account write failure"):
                self.register()
        finally:
            event.remove(Session, "after_flush", fail_after_flush)
        self.assertEqual(len(self.auth.list_users()), 2)
        self.assertEqual(self.register().status_code, 201)

    @patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": "test-shared-invite"})
    def test_registration_uses_small_auth_body_limit(self):
        response = TestClient(self.app).post("/api/auth/register", content="x" * 17000, headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)
