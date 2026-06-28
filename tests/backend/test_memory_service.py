from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.memory import LongTermMemoryService, MemoryNotFoundError, MemoryValidationError


class LongTermMemoryServiceTests(unittest.TestCase):
    def test_memory_crud_search_and_persistence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "memory.sqlite3"
            service = LongTermMemoryService(db_path)

            goal = service.create_goal(
                {
                    "title": "Build durable planning memory",
                    "description": "Keep structured project context locally.",
                    "metadata": {"toolCategory": "ai-demo", "toolKind": "fitness"},
                }
            )
            updated_goal = service.update_goal(
                goal["goal_id"],
                {"metadata": {"toolCategory": "ai-demo", "toolKind": "agent-learning"}, "status": "paused"},
            )
            project = service.create_project(
                {
                    "goal_id": goal["goal_id"],
                    "title": "Goal Planner MVP",
                    "description": "Create the local CRUD foundation.",
                    "metadata": {"sourceToolId": "agent-learning"},
                }
            )
            milestone = service.create_milestone(
                {
                    "project_id": project["project_id"],
                    "title": "SQLite schema ready",
                    "due_date": "2026-07-01",
                    "metadata": {"phase": 1},
                }
            )
            skipped_milestone = service.update_milestone(milestone["milestone_id"], {"status": "skipped"})
            action = service.create_action(
                {
                    "project_id": project["project_id"],
                    "title": "Draft memory API tests",
                    "due_date": "2026-06-30",
                    "metadata": {"source": "test"},
                }
            )
            skipped_action = service.update_action(action["action_id"], {"status": "skipped"})
            progress = service.create_progress(
                {
                    "project_id": project["project_id"],
                    "summary": "Repository layer verified",
                    "details": "CRUD objects round-trip through SQLite.",
                    "log_type": "tool_result",
                    "metadata": {"toolKind": "agent-learning"},
                }
            )
            tool_run = service.create_tool_run(
                {
                    "project_id": project["project_id"],
                    "goal_id": goal["goal_id"],
                    "tool_name": "goal_planner",
                    "intent": "Verify memory persistence",
                    "input_summary": "operation: smoke",
                    "output_summary": "Created smoke memory rows.",
                    "status": "success",
                    "input": {"operation": "smoke"},
                    "output": {"created": True},
                }
            )

            self.assertEqual(updated_goal["status"], "paused")
            self.assertEqual(updated_goal["metadata"]["toolKind"], "agent-learning")
            self.assertEqual(project["metadata"]["sourceToolId"], "agent-learning")
            self.assertEqual(milestone["status"], "not_started")
            self.assertEqual(milestone["metadata"]["phase"], 1)
            self.assertEqual(skipped_milestone["status"], "skipped")
            self.assertEqual(action["status"], "todo")
            self.assertEqual(action["metadata"]["source"], "test")
            self.assertEqual(skipped_action["status"], "skipped")
            self.assertEqual(progress["log_type"], "tool_result")
            self.assertEqual(progress["metadata"]["toolKind"], "agent-learning")
            self.assertEqual(tool_run["id"], tool_run["tool_run_id"])
            self.assertEqual(tool_run["intent"], "Verify memory persistence")
            self.assertEqual(tool_run["input_summary"], "operation: smoke")
            self.assertEqual(tool_run["output_summary"], "Created smoke memory rows.")
            self.assertEqual(tool_run["related_project_id"], project["project_id"])
            self.assertEqual(tool_run["input"]["operation"], "smoke")
            self.assertEqual(service.list_tool_runs()[0]["tool_run_id"], tool_run["tool_run_id"])
            self.assertEqual(
                service.list_project_tool_runs(project["project_id"])[0]["tool_run_id"],
                tool_run["tool_run_id"],
            )
            self.assertEqual(len(service.search("schema")), 1)
            self.assertGreaterEqual(len(service.search("goal")), 2)

            reopened = LongTermMemoryService(db_path)
            self.assertEqual(reopened.list_goals()[0]["goal_id"], goal["goal_id"])
            self.assertEqual(reopened.get_project(project["project_id"])["title"], "Goal Planner MVP")
            self.assertEqual(len(reopened.list_milestones(project["project_id"])), 1)
            self.assertEqual(len(reopened.list_actions(project["project_id"])), 1)
            self.assertEqual(len(reopened.list_progress(project["project_id"])), 1)
            self.assertEqual(len(reopened.list_project_tool_runs(project["project_id"])), 1)

    def test_memory_validates_statuses_and_missing_parents(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            service = LongTermMemoryService(Path(tmp_dir) / "memory.sqlite3")

            with self.assertRaises(MemoryValidationError):
                service.create_goal({"title": "Bad goal", "status": "started"})

            with self.assertRaises(MemoryNotFoundError):
                service.create_project({"goal_id": "goal_missing", "title": "Orphan project"})


if __name__ == "__main__":
    unittest.main()
