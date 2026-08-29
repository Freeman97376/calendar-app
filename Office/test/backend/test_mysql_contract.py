from __future__ import annotations

from datetime import date, timedelta
import os
import unittest
import uuid

from sqlalchemy import select, text

from backend.auth import AuthService
from backend.calendar import CalendarRepository
from backend.database import (
    ALEMBIC_HEAD,
    ActionItemRecord,
    GoalControlPolicyRecord,
    GoalRecord,
    MetricDefinitionRecord,
    MilestoneRecord,
    PlanDependencyRecord,
    PlanVersionRecord,
    ProjectRecord,
    create_database_engine,
)
from backend.goal_control import GoalControlService, GoalControlValidationError


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

    def test_active_tool_activation_is_transactional_idempotent_and_tenant_scoped(self) -> None:
        suffix = uuid.uuid4().hex[:10]
        auth = AuthService(self.engine)
        alice = auth.create_user(f"mysql_tool_a_{suffix}", "mysql-tool-alice-password")
        bob = auth.create_user(f"mysql_tool_b_{suffix}", "mysql-tool-bob-password")
        alice_control = GoalControlService(
            engine=self.engine, user_id=alice["id"], app_mode="server", initialize=False
        )
        bob_control = GoalControlService(
            engine=self.engine, user_id=bob["id"], app_mode="server", initialize=False
        )
        thread = alice_control.create_thread(
            {
                "title": "MySQL Active Tool",
                "template_id": "goal-planner",
                "metadata": {"journeyId": f"journey-{suffix}"},
            }
        )
        event_base = {
            "journeyId": f"journey-{suffix}",
            "source": "ai-assistant",
            "templateId": "goal-planner",
        }
        first_event = alice_control.record_funnel_event(
            None, {**event_base, "eventName": "tool_creation_request_submitted"}
        )
        repeated_event = alice_control.record_funnel_event(
            None, {**event_base, "eventName": "tool_creation_request_submitted"}
        )
        self.assertEqual(first_event["event_id"], repeated_event["event_id"])

        plan = {
            "title": "MySQL Active Tool",
            "summary": "Validate the complete transactional activation contract.",
            "template_id": "goal-planner",
            "template_label": "Goal Planner",
            "tool_name": "Goal Planner",
            "activation_journey_id": f"journey-{suffix}",
            "source": "ai-assistant",
            "assumptions": [],
            "constraints": [],
            "risks": [],
            "missing_information": [],
            "review_cadence": {"frequency": "weekly"},
            "confidence": {"level": "medium", "reasons": []},
            "milestones": [{"title": "MySQL milestone"}],
            "actions": [
                {
                    "title": "MySQL action",
                    "due_date": (date.today() + timedelta(days=7)).isoformat(),
                    "estimated_minutes": 30,
                    "execution_tier": "standard",
                }
            ],
            "metrics": [{"name": "Completed actions", "role": "leading"}],
            "dependencies": [
                {
                    "predecessor_title": "MySQL action",
                    "successor_title": "Missing MySQL action",
                }
            ],
            "policy": {
                "weekly_capacity_minutes": 120,
                "buffer_percent": 20,
                "active_tier": "standard",
            },
        }
        with self.assertRaisesRegex(GoalControlValidationError, "Invalid or cyclic dependency"):
            alice_control.activate_thread(thread["thread_id"], plan)

        with alice_control.session_factory() as session:
            for model in (
                GoalRecord,
                ProjectRecord,
                MilestoneRecord,
                ActionItemRecord,
                GoalControlPolicyRecord,
                MetricDefinitionRecord,
                PlanDependencyRecord,
                PlanVersionRecord,
            ):
                records = session.scalars(select(model).where(model.user_id == alice["id"])).all()
                self.assertEqual(records, [], model.__name__)
        self.assertEqual(alice_control.get_thread(thread["thread_id"])["status"], "draft")

        plan["dependencies"] = []
        activated = alice_control.activate_thread(thread["thread_id"], plan)
        retried = alice_control.activate_thread(thread["thread_id"], plan)
        self.assertEqual(
            activated["project"]["project_id"], retried["project"]["project_id"]
        )
        alice_control.record_funnel_event(
            thread["thread_id"],
            {
                **event_base,
                "eventName": "active_tool_workspace_opened",
                "projectId": activated["project"]["project_id"],
            },
        )
        self.assertEqual(alice_control.activation_funnel_baseline()["completion_rate"], 1.0)
        self.assertEqual(bob_control.activation_funnel_baseline()["submitted_journeys"], 0)
