from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from datetime import date, timedelta
import os
import unittest
import uuid

from sqlalchemy import select, text

from backend.auth import AuthError, AuthService
from backend.calendar import CalendarRepository
from backend.calendar.repository import CalendarBatchConflictError
from backend.scheduling import GlobalSchedulingService, SchedulingConflictError
from backend.user_data import PreferenceRepository
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

    def test_personal_ai_credentials_are_encrypted_and_serialized_per_account(self) -> None:
        from cryptography.fernet import Fernet
        from backend.personal_ai import PersonalAIService, PersonalAIUpdate
        from backend.database import UserAISettingRecord, create_session_factory
        suffix = uuid.uuid4().hex[:10]
        auth = AuthService(self.engine)
        alice = auth.create_user(f"mysql_ai_a_{suffix}", "mysql-ai-alice-password")
        bob = auth.create_user(f"mysql_ai_b_{suffix}", "mysql-ai-bob-password")
        with patch.dict(os.environ, {"CALENDAR_AI_ENCRYPTION_KEY": Fernet.generate_key().decode(), "DEEPSEEK_API_KEY": ""}):
            service = PersonalAIService(self.engine, alice["id"])
            def save(index):
                return service.save(PersonalAIUpdate(apiKey=f"synthetic-personal-key-{index}")).personalKeyConfigured
            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(list(pool.map(save, range(2))), [True, True])
            with create_session_factory(self.engine)() as session:
                rows = session.scalars(select(UserAISettingRecord).where(UserAISettingRecord.user_id == alice["id"])).all()
                self.assertEqual(len(rows), 1)
                self.assertNotIn("synthetic-personal-key", rows[0].encrypted_api_key)
            self.assertIn(service.resolve().api_key, ["synthetic-personal-key-0", "synthetic-personal-key-1"])
            self.assertFalse(PersonalAIService(self.engine, bob["id"]).status().personalKeyConfigured)
            service.remove()
            self.assertFalse(service.status().personalKeyConfigured)

    def test_shared_invite_concurrent_registration(self) -> None:
        suffix = uuid.uuid4().hex[:10]
        username = f"mysql_invite_{suffix}"
        code = "synthetic-mysql-shared-code"
        def attempt(_index):
            service = AuthService(self.engine)
            try:
                return service.register(username, "mysql-invite-password", code, client_ip=f"test-{suffix}")["role"]
            except AuthError as error:
                return error.code
        with patch.dict("os.environ", {"CALENDAR_REGISTRATION_INVITE_CODE": code}):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(attempt, range(2)))
            self.assertCountEqual(results, ["user", "username_exists"])
            service = AuthService(self.engine)
            second = service.register(f"mysql_invite2_{suffix}", "mysql-invite-password", code, client_ip=f"test-{suffix}")
            first = service.get_user_by_username(username)
            self.assertNotEqual(first.id, second["id"])
            self.assertEqual(service.login(username, "mysql-invite-password", client_ip=f"test-{suffix}").principal.role, "user")

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


    def test_concurrent_ai_operations_are_atomic_and_independently_idempotent(self) -> None:
        suffix = uuid.uuid4().hex[:10]
        user = AuthService(self.engine).create_user(f"mysql_ai_{suffix}", "synthetic-ai-password")
        user_id = user["id"]
        control = GoalControlService(engine=self.engine, user_id=user_id, app_mode="server", initialize=False)
        repository = CalendarRepository(engine=self.engine)
        thread = control.create_thread({"title": "Synthetic plan", "kind": "assistant_chat"})["thread_id"]
        payload = {"message_id": "mysql-stable", "role": "assistant", "content": "Create tasks", "structured": {"actionPlan": {"summary": "Synthetic", "actions": [{"type": "create_todo", "title": "Task A"}, {"type": "create_todo", "title": "Task B"}], "warnings": []}}}
        control.add_message(thread, payload)
        batch = {"source": "ai-action-plan", "idempotencyKey": "caller", "aiPlanRef": {"threadId": thread, "messageId": "mysql-stable"}, "aiPlanOperation": "apply", "actions": [{"clientActionId": str(i), "type": "create_todo", "todo": {"title": title}} for i, title in enumerate(["Task A", "Task B"])]}
        create = repository._create_todo_in_session
        calls = 0
        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("synthetic-rollback")
            return create(*args, **kwargs)
        with patch.object(repository, "_create_todo_in_session", side_effect=fail_second):
            with self.assertRaisesRegex(RuntimeError, "synthetic-rollback"):
                repository.apply_action_batch(batch, user_id)
        self.assertEqual(repository.list_todos(user_id), [])
        self.assertEqual(control.get_thread(thread)["messages"][0]["structured"]["actionPlanReview"]["operations"]["apply"]["status"], "pending")
        for operation in ("apply", "copy_to_todos"):
            request = {**copy.deepcopy(batch), "aiPlanOperation": operation}
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: repository.apply_action_batch(request, user_id), range(2)))
            self.assertEqual(sorted(item["replayed"] for item in results), [False, True])
            self.assertEqual(results[0]["batchId"], results[1]["batchId"])
        self.assertEqual(len(repository.list_todos(user_id)), 4)
        changed = copy.deepcopy(batch)
        changed["actions"][0]["todo"]["title"] = "Different"
        with self.assertRaises(CalendarBatchConflictError):
            repository.apply_action_batch(changed, user_id)

    def test_schedule_recompute_and_resolution_share_mysql_user_lock(self) -> None:
        suffix = uuid.uuid4().hex[:10]
        user = AuthService(self.engine).create_user(f"mysql_schedule_{suffix}", "synthetic-schedule-password")
        user_id = user["id"]
        control = GoalControlService(engine=self.engine, user_id=user_id, app_mode="server", initialize=False)
        thread = control.create_thread({"title": "Synthetic tool"})["thread_id"]
        due = (date.today() + timedelta(days=14)).isoformat()
        plan = {"title": "Synthetic tool", "summary": "Temporary test", "project_id": "mysql-tool", "template_id": "goal-planner", "template_label": "Goal Planner", "target_date": due, "milestones": [{"milestone_id": "finish", "title": "Finish", "due_date": due}], "actions": [{"action_id": "work", "title": "Synthetic work", "milestone_id": "finish", "due_date": due, "estimated_minutes": 30, "execution_tier": "standard"}], "metrics": [], "dependencies": [], "policy": {"weekly_capacity_minutes": 240, "buffer_percent": 20, "active_tier": "standard"}}
        control.activate_thread(thread, plan)
        PreferenceRepository(self.engine, user_id).update({"timezoneOverride": "UTC", "scheduling": {"setupCompleted": True, "workWindows": [{"day": day, "start": "09:00", "end": "17:00"} for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]], "minBlockMinutes": 30, "maxBlockMinutes": 120}})
        service = GlobalSchedulingService(self.engine, user_id, client_timezone="UTC")
        for status in ("paused", "active", "completed", "active"):
            version = control.dashboard("mysql-tool")["versions"][0]["version_id"]
            proposal = service.recompute(project_patch={"projectId": "mysql-tool", "baseVersionId": version, "changes": {"status": status}})
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: service.resolve(proposal["proposalId"], "accept", proposal["inputFingerprint"]), range(2)))
            self.assertEqual(sorted(item["replayed"] for item in results), [False, True])
            self.assertEqual(control.dashboard("mysql-tool")["project"]["status"], status)
        proposal = service.recompute()
        def resolve(decision):
            try:
                return service.resolve(proposal["proposalId"], decision, proposal["inputFingerprint"])["status"]
            except SchedulingConflictError:
                return "conflict"
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(resolve, ["accept", "reject"]))
        self.assertEqual(results.count("conflict"), 1)
        self.assertEqual(sum(item in {"accepted", "rejected"} for item in results), 1)
        version = control.dashboard("mysql-tool")["versions"][0]["version_id"]
        proposal = service.recompute(project_patch={"projectId": "mysql-tool", "baseVersionId": version, "changes": {"title": "Retained edit"}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: service.recompute(reason="concurrent-refresh"), range(2)))
        current = service.current()
        self.assertEqual(current["proposal"]["planChange"]["projectPatch"]["title"], "Retained edit")
        service.resolve(current["proposalId"], "accept", current["inputFingerprint"])
        self.assertEqual(control.dashboard("mysql-tool")["project"]["title"], "Retained edit")
