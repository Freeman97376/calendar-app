---
known_error_version: 1
id: ERR-LONG-TERM-NO-DEADLINE-002
status: fixed_unverified
severity: high
reported_at: 2026-08-29T20:48:28-07:00
resolved_at: 2026-08-29
root_cause_status: confirmed
regression_test_case: TC-LONG-TERM-DUE-DATE-001-v1
regression_test_path: Office/test/integration/goalPlanner.test.tsx; Office/test/backend/test_goal_control.py
regression_test_command: npm.cmd run test:run -- Office/test/integration/goalPlanner.test.tsx; node scripts/run-python.mjs -m unittest discover Office/test/backend -p test_goal_control.py
last_verified_at: 2026-08-30T01:54:46.4390909-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-LONG-TERM-NO-DEADLINE-002 - Rolling activation rejects a natural-language deadline

## Symptom

LT-02 and LT-07 both surfaced the English backend error `Plan dates must use YYYY-MM-DD.` instead of completing or safely blocking the planning flow with a specific Chinese explanation.

## Trigger

Create a long-term plan, state that there is no concrete hard deadline, retain a natural-language deadline description in `policy.planning_brief.deadline`, and approve the rolling plan while the root `target_date` is null.

## Evidence

The user reproduced the exact error during manual LT-02 on 2026-08-29 against working-tree@28245bb. Testing stopped immediately and activation was not retried. Read-only inspection confirmed that `activate_thread` derives its effective target from root `target_date` or `policy.planning_brief.deadline`, then `_validate_standard_capacity` attempts to parse that value as an ISO date and emits the reported generic error.

The user reported the same exact error again during manual LT-07 at 2026-08-29T21:11:32-07:00 against the same working tree. LT-07 input details were not supplied, so this is recorded as a second symptom reproduction without inferring that every trigger field matched LT-02. LT-07 was not retried, and LT-06 remains unreported.

## Expected behavior

An explicitly open-ended plan keeps its hard target date empty, schedules near-term required work inside the rolling horizon, and activates without treating descriptive planning text as a date. If activation is impossible, the UI must block before the request and show a specific Chinese explanation.

## Root cause

Confirmed in `backend/goal_control.py`: activation falls back from a null root `target_date` to the untyped `policy.planning_brief.deadline`. The planning brief accepts arbitrary metadata, so values such as `no fixed deadline` or `无固定日期` can reach an ISO-date parser. The frontend rolling scheduler clears or ignores root `target_date` but does not normalize this legacy fallback field before activation.

## Resolution

Implemented. Activation now derives the hard target exclusively from root `target_date`; `policy.planning_brief.deadline` remains descriptive metadata and is never parsed as a date. Open-ended plans preserve `target_date=null`, expired flexible system dates roll within the deterministic window, and actual invalid date fields return a Chinese field-specific error.

## Verification

Verified at evidence level A. The focused frontend run completed 58/58 tests, and the approved affected backend command completed 43/43 tests. The covered activation contract preserves `target_date=null`, ignores descriptive planning-brief deadline text, and assigns only valid rolling system dates to required actions.

## Manual verification

Not applicable. No waiver has been requested or approved.

## Notes

Linked contract: `rolling-plan-date-provenance` in `TC-LONG-TERM-DUE-DATE-001-v1`. This is distinct from `ERR-LONG-TERM-DUE-DATE-001`, which concerns missing required action dates.

LT-07 strengthens reproducibility of the same generic date-parsing failure but does not broaden the confirmed root cause beyond the inspected effective-target fallback path.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
