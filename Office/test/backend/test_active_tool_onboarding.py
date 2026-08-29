from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import select

from backend.database import (
    ActionItemRecord,
    ActivationFunnelEventRecord,
    GoalControlPolicyRecord,
    GoalRecord,
    MetricDefinitionRecord,
    MilestoneRecord,
    PlanDependencyRecord,
    PlanVersionRecord,
    ProjectRecord,
)
from backend.goal_control import GoalControlService, GoalControlValidationError


def activation_plan() -> dict:
    return {
        "title": "Safe fitness routine",
        "summary": "A conservative three-session routine.",
        "template_id": "fitness-ai",
        "template_label": "Fitness AI",
        "tool_name": "Fitness AI",
        "tool_kind": "fitness",
        "adapter_id": "ai-progress",
        "activation_form": {"constraints": "No known injuries"},
        "activation_journey_id": "journey-1",
        "source": "ai-assistant",
        "assumptions": ["Three sessions are realistic"],
        "constraints": ["Stop if pain occurs"],
        "risks": [{"label": "Overload", "severity": "medium"}],
        "review_cadence": {"frequency": "biweekly", "local_time": "19:30"},
        "confidence": {"level": "medium", "reasons": ["No baseline yet"]},
        "missing_information": [],
        "metrics": [{"name": "Sessions completed", "role": "leading"}],
        "milestones": [{"title": "Complete base phase", "due_date": "2026-09-30"}],
        "actions": [
            {
                "title": "Complete first session",
                "due_date": "2026-09-01",
                "estimated_minutes": 30,
                "execution_tier": "standard",
            }
        ],
        "dependencies": [],
        "policy": {
            "weekly_capacity_minutes": 180,
            "buffer_percent": 20,
            "active_tier": "standard",
        },
    }


class ActiveToolOnboardingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "onboarding.sqlite3"
        self.alice = GoalControlService(db_path=self.db_path, user_id="alice")
        self.bob = GoalControlService(db_path=self.db_path, user_id="bob")

    def tearDown(self) -> None:
        self.alice.engine.dispose()
        self.bob.engine.dispose()
        self.temp_dir.cleanup()

    def test_journey_scopes_draft_creation_to_user_and_template(self) -> None:
        payload = {
            "title": "Fitness draft",
            "template_id": "fitness-ai",
            "metadata": {"journeyId": "journey-1", "source": "ai-assistant"},
        }
        first = self.alice.create_thread(payload)
        repeated = self.alice.create_thread(payload)
        other_user = self.bob.create_thread(payload)

        self.assertEqual(first["thread_id"], repeated["thread_id"])
        self.assertNotEqual(first["thread_id"], other_user["thread_id"])

    def test_funnel_events_are_private_bounded_idempotent_and_aggregated(self) -> None:
        thread = self.alice.create_thread(
            {
                "title": "Fitness draft",
                "template_id": "fitness-ai",
                "metadata": {"journeyId": "journey-1"},
            }
        )
        base = {
            "journeyId": "journey-1",
            "source": "ai-assistant",
            "templateId": "fitness-ai",
        }
        first = self.alice.record_funnel_event(
            None, {**base, "eventName": "tool_creation_request_submitted"}
        )
        repeated = self.alice.record_funnel_event(
            None, {**base, "eventName": "tool_creation_request_submitted"}
        )
        self.alice.record_funnel_event(
            None, {**base, "eventName": "template_recommendation_shown"}
        )
        self.alice.record_funnel_event(
            thread["thread_id"],
            {**base, "eventName": "template_recommendation_accepted"},
        )
        self.alice.record_funnel_event(
            thread["thread_id"],
            {**base, "eventName": "active_tool_workspace_opened"},
        )

        self.assertEqual(first["event_id"], repeated["event_id"])
        self.assertEqual(self.alice.get_thread(thread["thread_id"])["messages"], [])
        with self.alice.session_factory() as session:
            records = session.scalars(
                select(ActivationFunnelEventRecord).where(
                    ActivationFunnelEventRecord.user_id == "alice"
                )
            ).all()
        self.assertEqual(len(records), 4)
        baseline = self.alice.activation_funnel_baseline("fitness-ai")
        self.assertEqual(baseline["submitted_journeys"], 1)
        self.assertEqual(baseline["opened_workspace_journeys"], 1)
        self.assertEqual(baseline["completion_rate"], 1.0)
        self.assertEqual(baseline["event_counts"]["tool_creation_request_submitted"], 1)
        self.assertEqual(baseline["failure_counts_by_stage"]["matching"], 0)
        self.assertEqual(self.bob.activation_funnel_baseline()["submitted_journeys"], 0)

        with self.assertRaisesRegex(GoalControlValidationError, "unsupported field"):
            self.alice.record_funnel_event(
                None,
                {
                    **base,
                    "eventName": "initial_plan_generated",
                    "metadata": {"rawPrompt": True},
                },
            )
        with self.assertRaisesRegex(GoalControlValidationError, "Invalid activation funnel"):
            self.alice.record_funnel_event(
                None, {**base, "eventName": "raw_prompt_captured"}
            )

    def test_fitness_requires_safety_and_activation_retry_returns_same_project(self) -> None:
        thread = self.alice.create_thread(
            {
                "title": "Fitness draft",
                "template_id": "fitness-ai",
                "metadata": {"journeyId": "journey-1"},
            }
        )
        plan = activation_plan()
        with self.assertRaisesRegex(GoalControlValidationError, "safety constraints"):
            self.alice.activate_thread(thread["thread_id"], plan)

        plan["safety_confirmation"] = True
        first = self.alice.activate_thread(thread["thread_id"], plan)
        repeated = self.alice.activate_thread(thread["thread_id"], plan)

        self.assertEqual(first["project"]["project_id"], repeated["project"]["project_id"])
        self.assertEqual(
            first["project"]["metadata"]["activationJourneyId"], "journey-1"
        )
        self.assertEqual(
            first["project"]["metadata"]["reviewCadence"]["frequency"], "biweekly"
        )

    def test_late_dependency_failure_rolls_back_every_activation_child(self) -> None:
        thread = self.alice.create_thread(
            {"title": "Rollback draft", "template_id": "fitness-ai"}
        )
        plan = activation_plan()
        plan["safety_confirmation"] = True
        plan["dependencies"] = [
            {
                "predecessor_title": "Complete first session",
                "successor_title": "Missing action",
            }
        ]

        with self.assertRaisesRegex(GoalControlValidationError, "Invalid or cyclic dependency"):
            self.alice.activate_thread(thread["thread_id"], plan)

        with self.alice.session_factory() as session:
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
                self.assertEqual(session.scalars(select(model)).all(), [], model.__name__)
        restored = self.alice.get_thread(thread["thread_id"])
        self.assertEqual(restored["status"], "draft")
        self.assertIsNone(restored["goal_id"])
        self.assertIsNone(restored["project_id"])

    def test_activation_contract_rejects_unknown_fields_before_writes(self) -> None:
        thread = self.alice.create_thread({"title": "Strict draft"})
        plan = activation_plan()
        plan["safety_confirmation"] = True
        plan["model_reply"] = "must never be persisted"

        with self.assertRaisesRegex(GoalControlValidationError, "unsupported fields"):
            self.alice.activate_thread(thread["thread_id"], plan)
        self.assertEqual(self.alice.get_thread(thread["thread_id"])["status"], "draft")


if __name__ == "__main__":
    unittest.main()
