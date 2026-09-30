---
known_error_version: 1
id: ERR-LONG-TERM-CAPACITY-003
status: fixed_unverified
severity: high
reported_at: 2026-08-29T20:52:20-07:00
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

# ERR-LONG-TERM-CAPACITY-003 - Capacity conflict reaches the backend with a past planning week

## Symptom

LT-03 and LT-05 both surfaced English backend capacity errors instead of a pre-activation scheduling decision. LT-03 reported `Week 2025-05-26 requires 240 Minimum/Standard minutes, exceeding the buffered weekly capacity of 144 minutes for 实现新版接口核心逻辑.` LT-05 reported `Week 2025-04-07 requires 360 Minimum/Standard minutes, exceeding the buffered weekly capacity of 192 minutes for Review database schema, Implement migration, Verify data integrity.`

## Trigger

Attempt to activate the LT-03 plan when the action `实现新版接口核心逻辑` requires 240 minutes and the effective weekly capacity after buffer is 144 minutes.

The same failure recurs in LT-05 when three required actions total 360 minutes in one week with only 192 buffered minutes.

## Evidence

The user reproduced the exact error during manual LT-03 on 2026-08-29 against working-tree@28245bb. Testing was not repeated. The backend capacity guard correctly calculated the numeric conflict, but the user received its internal English validation text after approval. The reported week `2025-05-26` is also earlier than the 2026-08-29 test date.

The user independently reproduced the same contract failure during manual LT-05 at 2026-08-29T21:02:31-07:00 against the same working tree. The backend calculated 360 required minutes against 192 buffered minutes and identified all three affected actions, but again exposed internal English validation after approval. Its reported week `2025-04-07` is also in the past. LT-05 was not retried.

## Expected behavior

Before activation, the frontend must detect the capacity conflict, identify the affected action and calculated capacity, and ask at most one consolidated scheduling question. The choices should include the calculated minimum capacity, the earliest feasible later target, eligible low-priority Stretch conversion, or manual dates. If unresolved, activation remains disabled and no backend request is sent. A newly generated unfinished action must not silently retain a past planning week without an explicit conflict explanation.

## Root cause

Confirmed. Both frontend and backend grouped all estimated minutes by each action's `due_date` week. That treated a deadline as the only execution week, so actions sharing a deadline could not use earlier weeks. Generated dates from an older planning context were also accepted as current unless the caller had already normalized them.

The 2026-08-30 continuation run confirmed a follow-up boundary defect in the replacement backend calculation. It computes `available_weeks` from week-start distance and grants a full capacity bucket for both the current and deadline weeks. When today is Sunday and the deadline is Monday, that yields two full weeks of capacity for one remaining day, so a 210-minute plan can incorrectly pass a 160-minute buffered weekly limit.

## Resolution

Implemented. Capacity validation now evaluates cumulative required minutes against all weeks available from today through each deadline. Same-date actions may consume prior weeks. Expired system-generated dates roll forward; explicit user-fixed historical dates remain blocked with a Chinese conflict. The global scheduler then validates real work windows minus fixed calendar occupancy before any calendar write.

Follow-up fix implemented. The backend activation guard now counts configured executable weekdays in the inclusive interval from the user's current date through each deadline. It prorates buffered capacity by those days instead of counting week-start buckets; invalid or absent weekday values use the existing Sunday fallback. A deterministic Sunday-to-Monday regression and mixed Chinese/English weekday regression protect the boundary.

## Verification

Verified at evidence level A. The focused frontend run previously completed 58/58 tests, and the approved affected backend command now completed 43/43 tests, including cumulative pre-deadline capacity, same-deadline distribution, expired system dates, fixed historical dates, and the Sunday-to-Monday configured-day boundary.

## Manual verification

Not applicable. No waiver has been requested or approved.

## Notes

Linked contract: `activation-fail-closed` and the capacity-conflict branch of `TC-LONG-TERM-DUE-DATE-001-v1`. This error is separate from missing dates and the no-hard-deadline fallback defect.

LT-05 strengthens reproducibility. The due-week-only capacity algorithm is confirmed as the scheduling defect; whether every historical UI path bypassed preflight in exactly the same way is intentionally not claimed.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
