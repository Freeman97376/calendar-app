---
known_error_version: 1
id: ERR-CAPACITY-DATE-FIXTURE-001
status: reproduced
severity: medium
reported_at: 2026-09-21T01:33:39.573927+00:00
resolved_at: none
root_cause_status: suspected
regression_test_case: none
regression_test_path: Office/test/backend/test_goal_control.py
regression_test_command: .venv-test/Scripts/python.exe -m unittest Office.test.backend.test_goal_control.GoalControlTests.test_twelve_week_plan_is_checked_per_week_not_as_one_week Office.test.backend.test_goal_control.GoalControlTests.test_activation_rejects_standard_plan_above_buffered_capacity
last_verified_at: none
verified_against: none
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-CAPACITY-DATE-FIXTURE-001 - Date-dependent capacity test failures

## Symptom

The full backend gate fails two existing goal capacity tests. A different date-window guard triggers before the expected capacity branch.

## Trigger

Run the two named tests with the observed local date 2026-09-20 / UTC 2026-09-21. Fixtures derive deadlines from `date.today()` and weekday arithmetic while activation applies execution-day availability.

## Evidence

New runtime: full backend run has one failure and one error. Unchanged previous release archive `calendar-20260920T180036Z`: same two tests reproduce one failure and one error independently. Diagnostic: required actions due 2026-09-21 have zero available execution days; one test expects a weekly-capacity error substring and the other expects activation success. Logs `.scratch/personal-ai-full-backend.log` and `.scratch/personal-ai-baseline-tests.log`.

## Expected behavior

Tests should deterministically exercise the intended weekly capacity and twelve-week spread contracts across calendar dates/timezones, without weakening business constraints.

## Root cause

Confirmed: date-derived fixture inputs reach a different guard in both runtime versions. Suspected contributing cause: local/UTC date and weekday boundaries; exact deterministic fixture repair has not been implemented.

## Resolution

No product or assertion changes in this task. Smallest follow-up: freeze the test clock or derive action dates from a single explicit test timezone and valid execution window, preserving the intended capacity assertions.

## Verification

Reproduced only; no passing fix claimed. Not caused by the personal API setting changes.

## Manual verification

Not applicable.

## Notes

Personal API feature and MySQL/browser gates passed independently. Existing provider/dependency advisories are separate.
