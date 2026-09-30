---
known_error_version: 1
id: ERR-LONG-TERM-DUE-DATE-001
status: fixed_unverified
severity: high
reported_at: 2026-08-29T11:17:53-07:00
resolved_at: 2026-08-30
root_cause_status: confirmed
regression_test_case: TC-LONG-TERM-DUE-DATE-001-v1
regression_test_path: Office/test/unit/domain/goalActionScheduling.test.ts; Office/test/integration/goalPlanner.test.tsx; Office/test/backend/test_goal_control.py
regression_test_command: npm.cmd run test:run -- Office/test/unit/domain/goalActionScheduling.test.ts Office/test/integration/goalPlanner.test.tsx; node scripts/run-python.mjs -m unittest discover Office/test/backend -p test_goal_control.py
last_verified_at: 2026-08-30T01:54:46.4390909-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-LONG-TERM-DUE-DATE-001 - Undated necessary actions reached backend activation

## Symptom

Activation surfaced the English backend error `Minimum and Standard actions require a valid due_date before plan activation` and listed the undated actions.

## Trigger

Generate or revise a long-term plan whose unfinished Minimum or Standard actions omit `due_date`, then approve the plan.

## Evidence

The user reproduced the exact backend validation error. Code inspection confirmed that the AI schema allowed null dates and the prior frontend blocker did not enforce the backend action-date contract.

## Expected behavior

Before activation, the frontend should deterministically fill missing planning dates when possible. If information or feasibility is insufficient, it should ask one consolidated question or show a Chinese blocking explanation without calling activation. A plan with no hard deadline should use explicit rolling-plan semantics rather than a fabricated user deadline.

## Root cause

Plan generation, frontend review, and backend activation did not share a scheduling preflight. The backend was the first layer to require dates, so users discovered an internal contract only after approval.

## Resolution

Added a deterministic dependency- and capacity-aware scheduler after generation and revision, one-question-per-fingerprint scheduling context, rolling four-week behavior with flexible date provenance, manual-entry highlighting, an activation preflight, and a stricter AI prompt contract. The backend validation remains unchanged as the final guard.

## Verification

Verified at evidence level A. The corrected focused frontend run completed 58/58 tests, and the approved affected backend command completed 43/43 tests. Together they cover deterministic date completion, one-question scheduling, manual-date blocking, rolling no-deadline activation, capacity conflicts, and strict backend rejection when the frontend is bypassed.

## Manual verification

The user-run results remain recorded separately. No additional manual rerun was performed during automated verification.

## Notes

The repair preserves valid existing dates and does not treat system-planned dates as user-supplied hard deadlines.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
