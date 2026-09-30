---
known_error_version: 1
id: ERR-GLOBAL-SCHEDULING-ATOMIC-LINK-005
status: fixed_unverified
severity: high
reported_at: 2026-08-30T01:25:25-07:00
resolved_at: 2026-08-30
root_cause_status: confirmed
regression_test_case: TC-GLOBAL-SCHEDULING-001-v1
regression_test_path: Office/test/backend/test_global_scheduling.py
regression_test_command: node scripts/run-python.mjs -m unittest Office.test.backend.test_global_scheduling
last_verified_at: 2026-08-30T01:54:46.4390909-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-GLOBAL-SCHEDULING-ATOMIC-LINK-005 - Proposal acceptance cannot persist new action-event links

## Symptom

Accepting an otherwise valid global scheduling proposal fails with `sqlite3.IntegrityError: FOREIGN KEY constraint failed` while inserting a scheduler-managed `action_event_links` record.

## Trigger

Create a valid pending proposal containing one or more new scheduler events and resolve it with `accept`. The failure reproduced both for an ordinary cross-tool schedule and for a combined active-tool edit plus global replan.

## Evidence

The approved affected backend run on 2026-08-30 executed 42 tests and produced two errors in `Office/test/backend/test_global_scheduling.py`. Both failed while inserting an action-event link whose `event_id` referred to an event staged in the same transaction.

## Expected behavior

Proposal acceptance must atomically insert each new event before its action-event link, then persist plan changes, links, the calendar batch, and accepted proposal status in the same transaction. Repeated acceptance must remain idempotent.

## Root cause

Confirmed. The referenced proposal, project, and action records already exist. `GlobalSchedulingService._apply_proposal` adds a new `EventRecord` and immediately adds its `ActionEventLinkRecord`, but there is no ORM relationship declaring their dependency and no explicit flush of the event. SQLite can therefore attempt the link insert before the new event parent exists.

## Resolution

Implemented. Each newly created event is explicitly flushed before its action-event link is added, while the enclosing proposal transaction remains unchanged. A regression case also forces a later link foreign-key failure and verifies that the event, link, calendar batch, and accepted proposal status are all rolled back.

## Verification

Verified at evidence level A. The approved affected backend command completed 43/43 tests, including ordinary proposal acceptance, combined active-tool edit acceptance, repeated acceptance idempotency, and the new forced link-failure rollback assertion. The latter confirmed that the event, link, calendar batch, and accepted proposal status do not survive a failed transaction.

## Manual verification

Not applicable. No waiver has been requested or approved.

## Notes

The transaction rollback preserved fail-closed atomicity; no partial calendar mutation was established. This error blocks successful acceptance rather than permitting partial writes.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
