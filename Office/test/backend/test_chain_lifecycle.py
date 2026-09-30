from __future__ import annotations

import copy
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch as mock_patch
from pathlib import Path

from sqlalchemy import select

from backend.calendar.repository import CalendarRepository, CalendarBatchConflictError
from backend.database import ConversationMessageRecord
from backend.goal_control import GoalControlService, GoalControlConflictError
from backend.scheduling import SchedulingConflictError, SchedulingStaleError
import test_global_scheduling as scheduling_fixture


class ScheduleLifecycleTests(unittest.TestCase):
    setUp = scheduling_fixture.GlobalSchedulingTests.setUp
    tearDown = scheduling_fixture.GlobalSchedulingTests.tearDown

    def patch(self, **changes):
        return {"projectId": "alpha", "baseVersionId": self.control.dashboard("alpha")["versions"][0]["version_id"], "changes": changes}

    def accept(self, proposal):
        return self.service.resolve(proposal["proposalId"], "accept", proposal["inputFingerprint"])

    def test_paused_and_completed_tools_can_resume(self):
        for status in ("paused", "completed"):
            self.accept(self.service.recompute(project_patch=self.patch(status=status)))
            restored = self.accept(self.service.recompute(project_patch=self.patch(status="active")))
            self.assertEqual(restored["status"], "accepted")
            self.assertEqual(self.control.dashboard("alpha")["project"]["status"], "active")

    def test_recompute_keeps_edit_and_reject_unlocks_next_edit(self):
        patch = self.patch(title="Pending title")
        first = self.service.recompute(project_patch=patch)
        self.assertEqual(self.service.recompute(project_patch=patch)["proposalId"], first["proposalId"])
        with self.assertRaises(SchedulingConflictError):
            self.service.recompute(project_patch=self.patch(title="Other title"))
        newer = self.service.recompute(reason="calendar_changed")
        self.assertEqual(newer["proposal"]["planChange"]["projectPatch"], patch["changes"])
        self.service.resolve(newer["proposalId"], "reject", newer["inputFingerprint"])
        self.accept(self.service.recompute(project_patch=self.patch(title="Final title")))
        self.assertEqual(self.control.dashboard("alpha")["project"]["title"], "Final title")

    def test_stale_refresh_retains_edit(self):
        proposal = self.service.recompute(project_patch=self.patch(title="Retained title"))
        self.calendar.update_event(self.fixed["id"], {"title": "Changed fixed event"}, "alice")
        with self.assertRaises(SchedulingStaleError) as raised:
            self.accept(proposal)
        self.assertEqual(raised.exception.latest["proposal"]["planChange"]["projectPatch"]["title"], "Retained title")
        self.accept(raised.exception.latest)

    def test_changed_plan_version_blocks_but_preserves_draft(self):
        proposal = self.service.recompute(project_patch=self.patch(title="Original edit"))
        self.control.create_version("alpha", {"summary": "Concurrent edit"})
        with self.assertRaises(SchedulingStaleError) as raised:
            self.accept(proposal)
        latest = raised.exception.latest
        self.assertEqual(latest["status"], "blocked")
        self.assertEqual(latest["proposal"]["conflicts"][0]["code"], "plan_version_changed")
        self.assertEqual(latest["proposal"]["planChange"]["projectPatch"], {"title": "Original edit"})

    def test_concurrent_accept_replays_and_opposite_decision_conflicts(self):
        proposal = self.service.recompute(project_patch=self.patch(title="Once"))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.accept(proposal), range(2)))
        self.assertEqual(sorted(item["replayed"] for item in results), [False, True])
        with self.assertRaises(SchedulingConflictError):
            self.service.resolve(proposal["proposalId"], "reject", proposal["inputFingerprint"])


class AIPlanLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.control = GoalControlService(db_path=Path(self.temp.name) / "chain.sqlite3", user_id="alice")
        self.calendar = CalendarRepository(engine=self.control.engine)
        self.thread = self.control.create_thread({"title": "Synthetic chat", "kind": "assistant_chat"})["thread_id"]
        self.payload = {"message_id": "stable-message", "role": "assistant", "content": "Synthetic plan", "structured": {"actionPlan": {"summary": "Create task", "actions": [{"type": "create_todo", "title": "Synthetic task"}], "warnings": []}}}

    def tearDown(self):
        self.control.engine.dispose()
        self.temp.cleanup()

    def batch(self, operation="apply"):
        return {"source": "ai-action-plan", "idempotencyKey": "caller-key", "aiPlanRef": {"threadId": self.thread, "messageId": "stable-message"}, "aiPlanOperation": operation, "actions": [{"clientActionId": "action-0", "type": "create_todo", "todo": {"title": "Synthetic task"}}]}

    def test_message_retry_and_conflicting_content(self):
        first = self.control.add_message(self.thread, self.payload)
        self.assertEqual(self.control.add_message(self.thread, self.payload)["message_id"], first["message_id"])
        changed = copy.deepcopy(self.payload)
        changed["content"] = "Different"
        with self.assertRaises(GoalControlConflictError):
            self.control.add_message(self.thread, changed)
        self.assertEqual(len(self.control.get_thread(self.thread)["messages"]), 1)

    def test_apply_and_copy_are_independently_idempotent_and_durable(self):
        self.control.add_message(self.thread, self.payload)
        first = self.calendar.apply_action_batch(self.batch(), "alice")
        retry = self.batch()
        retry["idempotencyKey"] = "different-caller-key"
        self.assertTrue(self.calendar.apply_action_batch(retry, "alice")["replayed"])
        self.assertEqual(len(self.calendar.list_todos("alice")), 1)
        self.calendar.apply_action_batch(self.batch("copy_to_todos"), "alice")
        self.assertTrue(self.calendar.apply_action_batch(self.batch("copy_to_todos"), "alice")["replayed"])
        self.assertEqual(len(self.calendar.list_todos("alice")), 2)
        review = self.control.get_thread(self.thread)["messages"][0]["structured"]["actionPlanReview"]
        self.assertEqual(review["operations"]["apply"]["batchId"], first["batchId"])
        self.assertEqual(review["operations"]["copy_to_todos"]["status"], "applied")

    def test_dismiss_and_missing_reference_cannot_execute(self):
        self.control.add_message(self.thread, self.payload)
        self.control.dismiss_ai_action_plan(self.thread, "stable-message")
        with self.assertRaises(CalendarBatchConflictError):
            self.calendar.apply_action_batch(self.batch(), "alice")
        missing = self.batch()
        missing.pop("aiPlanRef")
        with self.assertRaises(CalendarBatchConflictError):
            self.calendar.apply_action_batch(missing, "alice")
        self.assertEqual(self.calendar.list_todos("alice"), [])

    def test_legacy_and_other_user_plans_cannot_execute(self):
        self.control.add_message(self.thread, self.payload)
        with self.assertRaises(KeyError):
            self.calendar.apply_action_batch(self.batch(), "bob")
        with self.control.session_factory.begin() as session:
            record = session.scalar(select(ConversationMessageRecord).where(ConversationMessageRecord.message_id == "stable-message"))
            record.structured_json = copy.deepcopy(self.payload["structured"])
        with self.assertRaises(CalendarBatchConflictError):
            self.calendar.apply_action_batch(self.batch(), "alice")
        self.assertEqual(self.calendar.list_todos("alice"), [])

    def test_failed_batch_rolls_back_review_state_and_all_tasks(self):
        self.payload["structured"]["actionPlan"]["actions"] *= 2
        self.control.add_message(self.thread, self.payload)
        batch = self.batch()
        batch["actions"].append({**copy.deepcopy(batch["actions"][0]), "clientActionId": "second"})
        create = self.calendar._create_todo_in_session
        count = 0
        def failing_create(*args, **kwargs):
            nonlocal count
            count += 1
            if count == 2:
                raise RuntimeError("Synthetic failure")
            return create(*args, **kwargs)
        with mock_patch.object(self.calendar, "_create_todo_in_session", side_effect=failing_create):
            with self.assertRaisesRegex(RuntimeError, "Synthetic failure"):
                self.calendar.apply_action_batch(batch, "alice")
        self.assertEqual(self.calendar.list_todos("alice"), [])
        review = self.control.get_thread(self.thread)["messages"][0]["structured"]["actionPlanReview"]
        self.assertEqual(review["operations"]["apply"]["status"], "pending")
        self.assertFalse(self.calendar.apply_action_batch(batch, "alice")["replayed"])

    def test_concurrent_apply_creates_once_and_changed_payload_conflicts(self):
        self.control.add_message(self.thread, self.payload)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.calendar.apply_action_batch(self.batch(), "alice"), range(2)))
        self.assertEqual(sorted(item["replayed"] for item in results), [False, True])
        self.assertEqual(len(self.calendar.list_todos("alice")), 1)
        changed = self.batch()
        changed["actions"][0]["todo"]["title"] = "Different"
        with self.assertRaises(CalendarBatchConflictError):
            self.calendar.apply_action_batch(changed, "alice")


if __name__ == "__main__":
    unittest.main()
