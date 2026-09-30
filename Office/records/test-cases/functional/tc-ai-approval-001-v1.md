---
test_case_version: 1
id: TC-AI-APPROVAL-001-v1
type: functional
spec_status: confirmed
execution_status: not_run
version: 1
supersedes: none
superseded_by: none
purpose_status: confirmed
process_status: confirmed
expected_result_status: confirmed
confirmed_at: 2026-08-29T01:15:50-07:00
confirmed_by: user
source_kind: known-error
source_ids: ERR-AI-APPROVAL-001
test_path: Office/test/backend/test_auth_api.py; Office/test/unit/store/uiStore.test.ts; Office/test/unit/store/longTermMemoryStore.test.ts
test_command: npm.cmd run test:run -- Office/test/unit/store/uiStore.test.ts Office/test/unit/store/longTermMemoryStore.test.ts; node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_calendar_action_batch_is_atomic_idempotent_and_tenant_scoped
last_verified_at: none
verified_against: none
coverage_paths: backend/calendar/repository.py; backend/server.py; src/hooks/useAI.ts; src/hooks/useEnabledTools.ts; src/store/uiStore.ts; src/store/longTermMemoryStore.ts
contract_ids: calendar-action-batch; approval-snapshot; tenant-isolation
---

# TC-AI-APPROVAL-001-v1 - Atomic approval from a frozen review snapshot

## Purpose

Protect users from partial calendar changes, duplicate writes after a double click, cross-account mutation, and applying a plan that changed after the review drawer opened.

## Preconditions

Use isolated Vitest state and a temporary migrated SQLite server database with two synthetic accounts. Do not use production databases, real accounts, or a real AI provider.

## Process

Open review for an AI or Active Tool plan and retain its idempotency key. Mutate the source state after opening and confirm the review snapshot is unchanged. Submit a two-action batch whose second action fails and inspect calendar state. Submit a valid batch twice with the same key, then reuse the key with a changed payload. Attempt to mutate the first account's event as the second account.

## Expected result

The review content remains unchanged for the drawer lifetime. A failed action rolls back the entire batch. Identical retries return a replay without a second write. Changed payload reuse returns a conflict. Cross-account IDs remain inaccessible. Active Tool drafts remain unavailable while a different project is loading.

## Actual result

Partially run. The immutable approval and stale-project frontend units passed. Backend atomicity, idempotency, time validation, and tenant-isolation cases were not run because the focused command stopped at an obsolete integration expectation as requested.

## Evidence

The focused frontend command passed `Office/test/unit/store/uiStore.test.ts` and `Office/test/unit/store/longTermMemoryStore.test.ts` at 2026-08-29T01:19:14-07:00. The backend command did not start. The obsolete integration expectation was updated afterward and not rerun.

## Confirmation

The user explicitly asked to add the proposed input and approval cases while implementing the repair plan, with serious failures reported before further testing.

## Notes

Real MySQL concurrency remains a conditional release suite and is not authorized in this task.
