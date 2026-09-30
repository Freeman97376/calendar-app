from __future__ import annotations

import copy
import tempfile
import unittest
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient

from backend.calendar import CalendarRepository
from backend.database import (
    ActionEventLinkRecord,
    ActionItemRecord,
    CalendarActionBatchRecord,
    EventRecord,
    GoalControlPolicyRecord,
    PlanDependencyRecord,
    PlanVersionRecord,
    ProjectRecord,
    ScheduleProposalRecord,
)
from backend.goal_control import GoalControlService
from backend.scheduling import GlobalSchedulingService, SchedulingConflictError, SchedulingStaleError
from backend.server import create_app
from backend.user_data import PreferenceRepository


def active_plan(project_id: str, offset: int = 0) -> dict:
    due = date.today() + timedelta(days=14)
    return {
        "title": f"Active tool {project_id}",
        "summary": "Schedule deterministic work without moving fixed events.",
        "target_date": due.isoformat(),
        "goal_id": f"goal-{project_id}",
        "project_id": project_id,
        "template_id": "goal-planner",
        "template_label": "Goal Planner",
        "tool_name": "Goal Planner",
        "metrics": [],
        "milestones": [{"milestone_id": f"milestone-{project_id}", "title": "Finish", "due_date": due.isoformat()}],
        "actions": [
            {
                "action_id": f"action-{project_id}-{index}",
                "title": f"{project_id} action {index}",
                "milestone_id": f"milestone-{project_id}",
                "due_date": due.isoformat(),
                "estimated_minutes": 180 + offset,
                "priority": "high" if index == 0 else "medium",
                "execution_tier": "minimum" if index == 0 else "standard",
                "metadata": {"due_date_source": "system_planned", "due_date_flexibility": "flexible"},
            }
            for index in range(2)
        ],
        "dependencies": [{"predecessor_action_id": f"action-{project_id}-0", "successor_action_id": f"action-{project_id}-1"}],
        "policy": {
            "weekly_capacity_minutes": 240,
            "buffer_percent": 20,
            "available_days": ["Mon", "星期二", "wed", "thu", "fri", "sat", "sun"],
            "active_tier": "standard",
        },
    }


class GlobalSchedulingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "scheduling.sqlite3"
        self.control = GoalControlService(db_path=self.db_path, user_id="alice")
        for project_id in ("alpha", "beta"):
            thread = self.control.create_thread({"thread_id": f"thread-{project_id}", "title": project_id})
            self.control.activate_thread(thread["thread_id"], active_plan(project_id))
        PreferenceRepository(self.control.engine, "alice").update({
            "timezoneOverride": "UTC",
            "scheduling": {
                "setupCompleted": True,
                "workWindows": [
                    {"day": day, "start": "09:00", "end": "17:00"}
                    for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
                ],
                "minBlockMinutes": 30,
                "maxBlockMinutes": 120,
            },
        })
        self.calendar = CalendarRepository(engine=self.control.engine)
        tomorrow = date.today() + timedelta(days=1)
        fixed_start = datetime.combine(tomorrow, time(9), tzinfo=timezone.utc)
        self.fixed = self.calendar.create_event({
            "id": "fixed-meeting",
            "title": "Fixed meeting",
            "startAt": fixed_start.isoformat(),
            "endAt": (fixed_start + timedelta(hours=1)).isoformat(),
            "allDay": False,
            "eventTypeId": "general",
            "recurrenceRule": {
                "frequency": "daily",
                "interval": 1,
                "endCondition": {"type": "count", "occurrences": 3},
            },
        }, "alice")
        self.service = GlobalSchedulingService(self.control.engine, "alice", client_timezone="UTC")

    def tearDown(self) -> None:
        self.control.engine.dispose()
        self.temp_dir.cleanup()

    def test_cross_tool_schedule_avoids_fixed_events_and_accepts_atomically(self) -> None:
        proposal = self.service.recompute(reason="test")
        self.assertEqual(proposal["status"], "pending")
        creates = [item for item in proposal["proposal"]["changes"] if item["operation"] == "create"]
        self.assertGreaterEqual(len(creates), 4)
        ranges = sorted((item["event"]["startAt"], item["event"]["endAt"]) for item in creates)
        for previous, current in zip(ranges, ranges[1:]):
            self.assertLessEqual(previous[1], current[0])
        fixed_start = datetime.fromisoformat(self.fixed["startAt"].replace("Z", "+00:00"))
        fixed_end = datetime.fromisoformat(self.fixed["endAt"].replace("Z", "+00:00"))
        for occurrence_offset in range(3):
            occurrence_start = fixed_start + timedelta(days=occurrence_offset)
            occurrence_end = fixed_end + timedelta(days=occurrence_offset)
            self.assertTrue(all(
                not (
                    datetime.fromisoformat(start.replace("Z", "+00:00")) < occurrence_end
                    and datetime.fromisoformat(end.replace("Z", "+00:00")) > occurrence_start
                )
                for start, end in ranges
            ))

        accepted = self.service.resolve(proposal["proposalId"], "accept", proposal["inputFingerprint"])
        self.assertEqual(accepted["status"], "accepted")
        replayed = self.service.resolve(proposal["proposalId"], "accept", proposal["inputFingerprint"])
        self.assertTrue(replayed["replayed"])
        with self.control.session_factory() as session:
            links = list(session.scalars(select(ActionEventLinkRecord).where(ActionEventLinkRecord.user_id == "alice")))
            batches = list(session.scalars(select(CalendarActionBatchRecord).where(CalendarActionBatchRecord.user_id == "alice")))
        self.assertEqual(len(links), len(creates))
        self.assertTrue(all(item.managed_by == "global_scheduler" for item in links))
        self.assertEqual(len([item for item in batches if item.source == "global-schedule-proposal"]), 1)

    def test_stale_proposal_returns_latest_without_partial_write(self) -> None:
        proposal = self.service.recompute(reason="stale-test")
        self.calendar.create_event({
            "id": "new-fixed",
            "title": "New fixed event",
            "startAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "endAt": (datetime.now(timezone.utc) + timedelta(days=1, hours=1)).isoformat(),
            "allDay": False,
            "eventTypeId": "general",
        }, "alice")
        with self.assertRaises(SchedulingStaleError) as raised:
            self.service.resolve(proposal["proposalId"], "accept", proposal["inputFingerprint"])
        self.assertIn(raised.exception.latest["status"], {"pending", "blocked"})
        with self.control.session_factory() as session:
            old = session.scalar(select(ScheduleProposalRecord).where(ScheduleProposalRecord.proposal_id == proposal["proposalId"]))
            managed = list(session.scalars(select(ActionEventLinkRecord).where(ActionEventLinkRecord.managed_by == "global_scheduler")))
        self.assertEqual(old.status, "superseded")
        self.assertEqual(managed, [])

    def test_proposal_cannot_delete_unmanaged_event(self) -> None:
        proposal = self.service.recompute(reason="ownership-test")
        with self.control.session_factory.begin() as session:
            record = session.scalar(select(ScheduleProposalRecord).where(ScheduleProposalRecord.proposal_id == proposal["proposalId"]))
            value = copy.deepcopy(record.proposal_json)
            value["changes"] = [{
                "operation": "delete", "eventId": "fixed-meeting",
                "projectId": "alpha", "actionId": "action-alpha-0",
            }]
            record.proposal_json = value
        with self.assertRaises(SchedulingConflictError):
            self.service.resolve(proposal["proposalId"], "accept", proposal["inputFingerprint"])
        with self.control.session_factory() as session:
            fixed = session.scalar(select(EventRecord).where(EventRecord.user_id == "alice", EventRecord.id == "fixed-meeting"))
        self.assertIsNotNone(fixed)

    def test_link_failure_rolls_back_event_batch_and_proposal_acceptance(self) -> None:
        proposal = self.service.recompute(reason="rollback-link-test")
        creates = [
            item
            for item in proposal["proposal"]["changes"]
            if item["operation"] == "create"
        ]
        self.assertGreaterEqual(len(creates), 1)
        event_id = creates[0]["eventId"]
        idempotency_key = f"global-schedule:{proposal['proposalId']}"

        with self.control.session_factory.begin() as session:
            record = session.scalar(select(ScheduleProposalRecord).where(
                ScheduleProposalRecord.proposal_id == proposal["proposalId"]
            ))
            value = copy.deepcopy(record.proposal_json)
            invalid_change = copy.deepcopy(creates[0])
            invalid_change["actionId"] = "missing-action"
            value["changes"] = [invalid_change]
            record.proposal_json = value

        with self.assertRaises(IntegrityError):
            self.service.resolve(
                proposal["proposalId"], "accept", proposal["inputFingerprint"]
            )

        with self.control.session_factory() as session:
            stored_proposal = session.scalar(select(ScheduleProposalRecord).where(
                ScheduleProposalRecord.proposal_id == proposal["proposalId"]
            ))
            event = session.scalar(select(EventRecord).where(
                EventRecord.user_id == "alice",
                EventRecord.id == event_id,
            ))
            link = session.scalar(select(ActionEventLinkRecord).where(
                ActionEventLinkRecord.user_id == "alice",
                ActionEventLinkRecord.event_id == event_id,
            ))
            batch = session.scalar(select(CalendarActionBatchRecord).where(
                CalendarActionBatchRecord.user_id == "alice",
                CalendarActionBatchRecord.idempotency_key == idempotency_key,
            ))

        self.assertEqual(stored_proposal.status, "pending")
        self.assertIsNone(event)
        self.assertIsNone(link)
        self.assertIsNone(batch)

    def test_active_tool_edit_is_simulated_then_applied_with_schedule_atomically(self) -> None:
        dashboard = self.control.dashboard("alpha")
        project_metadata = copy.deepcopy(dashboard["project"]["metadata"])
        project_metadata["targetDate"] = None
        proposal = self.service.recompute(
            reason="active-tool-edit",
            project_patch={
                "projectId": "alpha",
                "baseVersionId": dashboard["versions"][0]["version_id"],
                "changes": {
                    "metadata": project_metadata,
                    "policy": {
                        "weeklyCapacityMinutes": 600,
                        "bufferPercent": 10,
                        "availableDays": ["mon", "tue", "wed", "thu", "fri"],
                    },
                    "actions": [{
                        "actionId": "action-alpha-0",
                        "title": "Edited alpha action",
                        "dueDate": (date.today() + timedelta(days=21)).isoformat(),
                        "estimatedMinutes": 135,
                        "executionTier": "minimum",
                        "priority": "low",
                    }],
                    "dependencies": [],
                },
            },
        )
        self.assertEqual(proposal["status"], "pending")
        self.assertEqual(proposal["proposal"]["planChange"]["projectId"], "alpha")
        self.assertTrue(any(
            item["actionId"] == "action-alpha-0"
            and item.get("event", {}).get("title") == "Edited alpha action"
            for item in proposal["proposal"]["changes"]
        ))

        accepted = self.service.resolve(
            proposal["proposalId"], "accept", proposal["inputFingerprint"]
        )
        self.assertEqual(accepted["status"], "accepted")
        with self.control.session_factory() as session:
            action = session.scalar(select(ActionItemRecord).where(
                ActionItemRecord.user_id == "alice",
                ActionItemRecord.action_id == "action-alpha-0",
            ))
            policy = session.scalar(select(GoalControlPolicyRecord).where(
                GoalControlPolicyRecord.user_id == "alice",
                GoalControlPolicyRecord.project_id == "alpha",
            ))
            project = session.scalar(select(ProjectRecord).where(
                ProjectRecord.user_id == "alice",
                ProjectRecord.project_id == "alpha",
            ))
            dependencies = list(session.scalars(select(PlanDependencyRecord).where(
                PlanDependencyRecord.user_id == "alice",
                PlanDependencyRecord.project_id == "alpha",
            )))
            versions = list(session.scalars(select(PlanVersionRecord).where(
                PlanVersionRecord.user_id == "alice",
                PlanVersionRecord.project_id == "alpha",
            )))
        self.assertEqual(action.title, "Edited alpha action")
        self.assertEqual(action.estimated_minutes, 135)
        self.assertEqual(action.metadata_json["due_date_source"], "user_fixed")
        self.assertEqual(policy.weekly_capacity_minutes, 600)
        self.assertEqual(policy.buffer_percent, 10)
        self.assertEqual(policy.available_days_json, ["mon", "tue", "wed", "thu", "fri"])
        self.assertIsNone(project.metadata_json["targetDate"])
        self.assertEqual(dependencies, [])
        self.assertGreaterEqual(len(versions), 2)

    def test_schedule_proposals_are_user_scoped(self) -> None:
        alice = self.service.recompute(reason="alice-scope")
        bob_service = GlobalSchedulingService(
            self.control.engine, "bob", client_timezone="UTC"
        )
        self.assertIsNone(bob_service.current())
        bob = bob_service.recompute(reason="bob-scope")
        self.assertEqual(bob["status"], "blocked")
        self.assertNotEqual(bob["proposalId"], alice["proposalId"])
        self.assertEqual(self.service.current()["proposalId"], alice["proposalId"])


class GlobalSchedulingApiTests(unittest.TestCase):
    def test_unconfigured_work_windows_return_one_blocked_setup_proposal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{(Path(temp_dir) / 'api.sqlite3').as_posix()}"
            app = create_app(mode="desktop", configured_database_url=database_url, launch_token="schedule-token")
            try:
                client = TestClient(app)
                headers = {"X-Desktop-Token": "schedule-token"}
                response = client.post(
                    "/api/scheduling/proposals/recompute",
                    headers=headers,
                    json={"reason": "api-test"},
                )
                self.assertEqual(response.status_code, 200, response.text)
                proposal = response.json()["proposal"]
                self.assertEqual(proposal["status"], "blocked")
                self.assertEqual(proposal["proposal"]["kind"], "setup_required")
                current = client.get("/api/scheduling/proposals/current", headers=headers)
                self.assertEqual(current.json()["proposal"]["proposalId"], proposal["proposalId"])
                rejected = client.post(
                    f"/api/scheduling/proposals/{proposal['proposalId']}/resolve",
                    headers=headers,
                    json={"decision": "accept", "inputFingerprint": proposal["inputFingerprint"]},
                )
                self.assertEqual(rejected.status_code, 409, rejected.text)
                self.assertEqual(rejected.json()["error"]["code"], "schedule_proposal_conflict")
            finally:
                app.state.calendar.engine.dispose()


class GlobalSchedulingMigrationTests(unittest.TestCase):
    def test_global_schedule_migration_upgrades_and_rolls_back_on_sqlite(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "migration.sqlite3"
            database_url = f"sqlite:///{database_path.as_posix()}"
            project_root = Path(__file__).resolve().parents[3]
            config = Config(str(project_root / "alembic.ini"))
            config.set_main_option(
                "script_location",
                str(project_root / "backend" / "calendar" / "migrations"),
            )
            config.set_main_option("sqlalchemy.url", database_url)

            command.upgrade(config, "20260829_0011")
            engine = create_engine(database_url)
            try:
                inspector = inspect(engine)
                self.assertIn("schedule_proposals", inspector.get_table_names())
                columns = {
                    item["name"] for item in inspector.get_columns("action_event_links")
                }
                self.assertTrue({"managed_by", "proposal_id"}.issubset(columns))
            finally:
                engine.dispose()

            command.downgrade(config, "20260829_0010")
            engine = create_engine(database_url)
            try:
                inspector = inspect(engine)
                self.assertNotIn("schedule_proposals", inspector.get_table_names())
                columns = {
                    item["name"] for item in inspector.get_columns("action_event_links")
                }
                self.assertFalse({"managed_by", "proposal_id"} & columns)
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
