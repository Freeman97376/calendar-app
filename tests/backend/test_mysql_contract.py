from __future__ import annotations

import os
import unittest
import uuid

from sqlalchemy import text

from backend.auth import AuthService
from backend.calendar import CalendarRepository
from backend.database import ALEMBIC_HEAD, create_database_engine


MYSQL_TEST_URL = os.getenv("CALENDAR_MYSQL_TEST_URL", "").strip()


@unittest.skipUnless(MYSQL_TEST_URL, "CALENDAR_MYSQL_TEST_URL is not configured")
class MySqlContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_database_engine(MYSQL_TEST_URL)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_alembic_head_and_multi_user_repository_contract(self) -> None:
        with self.engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        self.assertEqual(revision, ALEMBIC_HEAD)

        suffix = uuid.uuid4().hex[:10]
        auth = AuthService(self.engine)
        alice = auth.create_user(f"mysql_a_{suffix}", "mysql-alice-password")
        bob = auth.create_user(f"mysql_b_{suffix}", "mysql-bob-password")
        repository = CalendarRepository(engine=self.engine)
        for user, title in ((alice, "Alice MySQL event"), (bob, "Bob MySQL event")):
            repository.create_event(
                {
                    "id": "shared-business-id",
                    "title": title,
                    "startAt": "2026-07-13T10:00:00Z",
                    "endAt": "2026-07-13T11:00:00Z",
                },
                user["id"],
            )
        alice_events = repository.list_events(
            "2026-07-13T00:00:00Z", "2026-07-14T00:00:00Z", alice["id"]
        )
        bob_events = repository.list_events(
            "2026-07-13T00:00:00Z", "2026-07-14T00:00:00Z", bob["id"]
        )
        self.assertEqual([item["title"] for item in alice_events], ["Alice MySQL event"])
        self.assertEqual([item["title"] for item in bob_events], ["Bob MySQL event"])
