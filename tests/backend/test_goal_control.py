from __future__ import annotations

import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from backend.goal_control import GoalControlService, GoalControlValidationError
from backend.database import CheckInRecord
from backend.memory import LongTermMemoryService
from backend.user_data import BackupValidationError, DataPortabilityService, checksum_entities


def mock_plan() -> dict:
    return {
        "title": "12-week strength plan",
        "summary": "Increase strength without exceeding four hours per week.",
        "target_date": "2026-10-15",
        "goal_id": "shared-goal",
        "project_id": "shared-project",
        "template_id": "fitness",
        "template_label": "Fitness",
        "tool_features": ["Weekly capacity", "Weight trend", "Strength milestones"],
        "route_tags": ["fitness", "strength"],
        "metrics": [
            {"metric_id": "completion", "name": "Training completion", "role": "leading", "unit": "%", "direction": "increase", "baseline_value": 50, "target_value": 85, "cadence": "weekly", "is_required": True},
            {"metric_id": "bench", "name": "Bench press", "role": "lagging", "unit": "kg", "direction": "increase", "baseline_value": 60, "target_value": 75, "cadence": "weekly"},
        ],
        "milestones": [{"milestone_id": "base", "title": "Base phase", "due_date": "2026-08-15"}],
        "actions": [
            {"action_id": "train", "title": "Complete three sessions", "milestone_id": "base", "due_date": "2026-08-08", "estimated_minutes": 180, "execution_tier": "minimum"},
            {"action_id": "review", "title": "Review weekly load", "milestone_id": "base", "due_date": "2026-08-15", "estimated_minutes": 30, "execution_tier": "standard"},
        ],
        "dependencies": [{"predecessor_action_id": "train", "successor_action_id": "review"}],
        "policy": {"weekly_capacity_minutes": 300, "buffer_percent": 20, "active_tier": "standard", "ai_usage_mode": "quality", "planning_brief": {"summary": "Five-hour strength plan"}},
    }


class GoalControlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "control.sqlite3"
        self.env = patch.dict(
            "os.environ",
            {"AI_DEFAULT_USAGE_MODE": "balanced", "AI_MAX_USAGE_MODE": "balanced", "AI_MONTHLY_SOFT_LIMIT": "75", "AI_MONTHLY_HARD_LIMIT": "100"},
        )
        self.env.start()
        self.alice = GoalControlService(db_path=self.db_path, user_id="alice")
        self.bob = GoalControlService(db_path=self.db_path, user_id="bob")

    def tearDown(self) -> None:
        self.alice.engine.dispose()
        self.bob.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def activate(self, service: GoalControlService) -> dict:
        thread = service.create_thread({"thread_id": "shared-thread", "title": "Build strength"})
        service.add_message(thread["thread_id"], {"role": "assistant", "content": "Choose a baseline.", "structured": {"kind": "question_batch", "questions": [{"id": "baseline", "prompt": "Current level?", "selectionMode": "single", "choices": [{"id": "new", "label": "New"}, {"id": "trained", "label": "Trained"}], "allowCustom": True}]}})
        return service.activate_thread(thread["thread_id"], mock_plan())

    def test_multi_user_isolation_same_business_ids_and_cycle_rejection(self) -> None:
        alice = self.activate(self.alice)
        bob = self.activate(self.bob)
        self.assertEqual(alice["project"]["project_id"], bob["project"]["project_id"])
        self.alice.add_metric_entry("bench", {"numeric_value": 62, "source": "manual"})
        self.assertEqual(len(self.alice.list_metrics("shared-project")[1]["entries"]), 1)
        self.assertEqual(len(self.bob.list_metrics("shared-project")[1]["entries"]), 0)
        with self.assertRaises(GoalControlValidationError):
            self.alice.add_dependency("shared-project", {"predecessor_action_id": "review", "successor_action_id": "train"})

    def test_activation_rejects_standard_plan_above_buffered_capacity(self) -> None:
        thread = self.alice.create_thread({"title": "Overloaded plan"})
        plan = mock_plan()
        plan["policy"]["weekly_capacity_minutes"] = 200
        with self.assertRaisesRegex(GoalControlValidationError, "buffered weekly capacity"):
            self.alice.activate_thread(thread["thread_id"], plan)

    def test_twelve_week_plan_is_checked_per_week_not_as_one_week(self) -> None:
        thread = self.alice.create_thread({"title": "Twelve week plan"})
        plan = mock_plan()
        start = date(2026, 7, 20)
        plan["target_date"] = (start + timedelta(weeks=12)).isoformat()
        plan["milestones"] = [{"milestone_id": "long", "title": "Long plan", "due_date": plan["target_date"]}]
        plan["actions"] = [
            {
                "action_id": f"week-{index + 1}",
                "title": f"Week {index + 1} work",
                "milestone_id": "long",
                "due_date": (start + timedelta(weeks=index)).isoformat(),
                "estimated_minutes": 120,
                "execution_tier": "standard",
            }
            for index in range(12)
        ]
        plan["dependencies"] = []
        plan["policy"]["weekly_capacity_minutes"] = 180
        activated = self.alice.activate_thread(thread["thread_id"], plan)
        self.assertEqual(activated["project"]["project_id"], "shared-project")

    def test_check_in_uses_project_timezone_and_updates_rolling_summary(self) -> None:
        thread = self.alice.create_thread({"thread_id": "timezone-thread", "title": "Timezone plan"})
        plan = mock_plan()
        plan["check_in"] = {"timezone": "America/Los_Angeles", "local_time": "20:00"}
        self.alice.activate_thread(thread["thread_id"], plan)
        created = self.alice.ensure_check_ins("2026-07-14")
        self.assertEqual(created[0]["due_at"], "2026-07-15T03:00:00Z")
        message = self.alice.add_message(
            thread["thread_id"],
            {"role": "assistant", "content": "Plan ready", "summaryUpdate": "Baseline 60 kg; target 75 kg; stop on pain."},
        )
        updated = self.alice.get_thread(thread["thread_id"])
        self.assertEqual(updated["rolling_summary"], "Baseline 60 kg; target 75 kg; stop on pain.")
        self.assertEqual(updated["summary_through_message_id"], message["message_id"])

    def test_check_in_due_time_tracks_daylight_saving_transitions(self) -> None:
        before_dst = GoalControlService._check_in_due_at(
            date(2026, 3, 7), "20:00", "America/Los_Angeles"
        )
        after_dst = GoalControlService._check_in_due_at(
            date(2026, 3, 8), "20:00", "America/Los_Angeles"
        )
        self.assertEqual(before_dst, "2026-03-08T04:00:00Z")
        self.assertEqual(after_dst, "2026-03-09T03:00:00Z")

    def test_skipped_action_does_not_increase_completion(self) -> None:
        self.activate(self.alice)
        memory = LongTermMemoryService(engine=self.alice.engine, user_id="alice")
        memory.update_action("train", {"status": "done"})
        memory.update_action("review", {"status": "skipped"})

        factors = {
            item["key"]: item for item in self.alice.dashboard("shared-project")["health"]["factors"]
        }
        self.assertEqual(factors["completion"]["value"], 50)
        self.assertEqual(factors["skipped"]["value"], 1)

    def test_check_in_rejects_unknown_choice_without_partial_write(self) -> None:
        self.activate(self.alice)
        created = self.alice.ensure_check_ins("2026-07-14")
        with self.assertRaisesRegex(GoalControlValidationError, "Unknown selected choice"):
            self.alice.answer_check_in(
                created[0]["check_in_id"],
                {"answers": {"progress": {"selected": ["invented"]}}, "effort_minutes": 60},
            )
        pending = self.alice.list_pending_check_ins()
        self.assertEqual(pending[0]["status"], "pending")
        self.assertEqual(self.alice.list_effort("shared-project"), [])

    def test_mock_plan_manual_change_and_rollback(self) -> None:
        activated = self.activate(self.alice)
        first_version = activated["version"]
        memory = LongTermMemoryService(engine=self.alice.engine, user_id="alice")
        metric_entry = self.alice.add_metric_entry("bench", {"numeric_value": 62, "source": "manual"})
        effort = self.alice.add_effort("shared-project", {"action_id": "train", "minutes": 45})
        progress = memory.create_progress({
            "project_id": "shared-project",
            "action_id": "train",
            "summary": "Completed the first working set.",
        })
        memory.update_action("train", {"title": "Complete four sessions", "estimated_minutes": 220})
        changed = self.alice.create_version("shared-project", {"source": "manual", "summary": "Increase training frequency"})
        self.assertEqual(changed["version_number"], 2)
        memory.update_action("review", {"title": "Review load and recovery"})
        coalesced = self.alice.create_version("shared-project", {"source": "manual", "summary": "Refine the same editing session"})
        self.assertEqual(coalesced["version_number"], 2)
        self.assertEqual(len(self.alice.list_versions("shared-project")), 2)
        self.assertEqual(next(item for item in memory.list_actions("shared-project") if item["action_id"] == "train")["title"], "Complete four sessions")
        rolled_back = self.alice.rollback_version(first_version["version_id"])
        self.assertEqual(rolled_back["version_number"], 3)
        self.assertEqual(next(item for item in memory.list_actions("shared-project") if item["action_id"] == "train")["title"], "Complete three sessions")
        metrics = self.alice.list_metrics("shared-project")
        self.assertIn(metric_entry["entry_id"], {entry["entry_id"] for metric in metrics for entry in metric["entries"]})
        self.assertEqual(next(item for item in self.alice.list_effort("shared-project") if item["effort_id"] == effort["effort_id"])["action_id"], "train")
        self.assertEqual(next(item for item in memory.list_progress("shared-project") if item["progress_id"] == progress["progress_id"])["action_id"], "train")

    def test_ai_plan_change_waits_for_partial_approval(self) -> None:
        self.activate(self.alice)
        dashboard = self.alice.dashboard("shared-project")
        memory = LongTermMemoryService(engine=self.alice.engine, user_id="alice")
        before_train = next(item for item in dashboard["actions"] if item["action_id"] == "train")
        after_train = {**before_train, "title": "Complete four approved sessions", "estimated_minutes": 200}
        proposed_snapshot = {
            "project": dashboard["project"], "milestones": dashboard["milestones"],
            "actions": [after_train if item["action_id"] == "train" else item for item in dashboard["actions"]],
            "policy": dashboard["policy"], "metrics": dashboard["metrics"], "dependencies": dashboard["dependencies"],
        }
        proposal = self.alice.create_proposal({
            "project_id": "shared-project", "base_version_id": dashboard["versions"][0]["version_id"],
            "reason": "Increase approved training frequency",
            "proposal": {"snapshot": proposed_snapshot, "progressLog": {"summary": "AI proposal approved", "logType": "decision"}},
            "diff": [{"id": "train-update", "entity": "action", "operation": "update", "external_id": "train", "before": before_train, "after": after_train}],
        })
        self.assertEqual(next(item for item in memory.list_actions("shared-project") if item["action_id"] == "train")["title"], "Complete three sessions")
        accepted = self.alice.resolve_proposal(proposal["proposal_id"], True, ["train-update"])
        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(next(item for item in memory.list_actions("shared-project") if item["action_id"] == "train")["title"], "Complete four approved sessions")
        self.assertEqual(memory.list_progress("shared-project")[0]["summary"], "AI proposal approved")

    def test_mode_clamping_usage_budget_and_check_in(self) -> None:
        self.activate(self.alice)
        policy = self.alice.get_policy("shared-project")
        self.assertEqual(policy["ai_usage_mode"], "quality")
        self.assertEqual(policy["usage"]["selected_mode"], "quality")
        self.assertEqual(policy["usage"]["effective_mode"], "balanced")
        self.alice.record_usage(operation="routine", model="mock-routine", usage_mode="balanced", input_tokens=60, output_tokens=20, project_id="shared-project")
        usage = self.alice.usage_summary("shared-project")
        self.assertTrue(usage["warning"])
        self.assertFalse(usage["degraded"])
        self.alice.record_usage(operation="planning", model="mock-planning", usage_mode="balanced", input_tokens=20, output_tokens=1, project_id="shared-project")
        self.assertTrue(self.alice.usage_summary("shared-project")["degraded"])
        created = self.alice.ensure_check_ins("2026-07-14")
        self.assertEqual(len(created), 1)
        answered = self.alice.answer_check_in(created[0]["check_in_id"], {"answers": {"progress": {"selected": ["most"]}, "effort": {"selected": ["60"]}}, "effort_minutes": 60})
        self.assertEqual(answered["status"], "answered")
        self.assertEqual(self.alice.list_effort("shared-project")[0]["minutes"], 60)

    def test_medium_sensitivity_requires_two_off_track_reviews(self) -> None:
        self.activate(self.alice)
        today = date.today()
        with self.alice.session_factory.begin() as session:
            for index in range(2):
                day = (today - timedelta(days=index * 7)).isoformat()
                session.add(CheckInRecord(
                    check_in_id=f"off-track-{index}", user_id="alice", project_id="shared-project", thread_id="shared-thread",
                    period_start=day, period_end=day, due_at=f"{day}T20:00:00", status="answered", includes_review=True,
                    questions_json=[], answers_json=[{"question_id": "progress", "selected": ["some"]}], summary_json={},
                    answered_at=f"{day}T20:00:00Z", skipped_at=None, created_at=f"{day}T20:00:00Z", updated_at=f"{day}T20:00:00Z",
                ))
        review = self.alice.dashboard("shared-project")["review"]
        self.assertTrue(review["recommend_replan"])
        self.assertIn("off_track_reviews", {item["key"] for item in review["triggers"]})
        self.assertLessEqual(len(review["triggers"]), 3)

    def test_backup_v2_includes_control_data_but_excludes_ai_usage(self) -> None:
        self.activate(self.alice)
        self.alice.record_usage(operation="planning", model="mock", usage_mode="balanced", input_tokens=10, output_tokens=5, project_id="shared-project")
        portability = DataPortabilityService(self.alice.engine)
        backup = portability.export("alice")
        self.assertEqual(backup["formatVersion"], 2)
        self.assertEqual(len(backup["entities"]["metricDefinitions"]), 2)
        self.assertNotIn("aiUsageEvents", backup["entities"])
        portability.import_backup("charlie", backup, source="goal-control-test")
        charlie = GoalControlService(engine=self.alice.engine, user_id="charlie")
        self.assertEqual(charlie.dashboard("shared-project")["project"]["title"], "12-week strength plan")
        self.assertEqual(charlie.usage_summary()["total_tokens"], 0)

    def test_backup_relationship_failure_rolls_back_the_entire_import(self) -> None:
        self.activate(self.alice)
        portability = DataPortabilityService(self.alice.engine)
        backup = portability.export("alice")
        backup["entities"]["actions"][0]["project_id"] = "missing-project"
        backup["checksum"] = checksum_entities(backup["entities"])

        with self.assertRaisesRegex(BackupValidationError, r"actions\[0\]\.project_id=missing-project"):
            portability.import_backup("charlie", backup, source="broken-relationship")

        charlie_memory = LongTermMemoryService(engine=self.alice.engine, user_id="charlie")
        self.assertEqual(charlie_memory.list_goals(), [])


if __name__ == "__main__":
    unittest.main()
