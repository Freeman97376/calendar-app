---
known_error_version: 1
id: ERR-AI-APPROVAL-001
status: fixed_unverified
severity: high
reported_at: 2026-08-29T01:15:50-07:00
resolved_at: none
root_cause_status: confirmed
regression_test_case: TC-AI-APPROVAL-001-v1
regression_test_path: Office/test/backend/test_auth_api.py; Office/test/unit/store/uiStore.test.ts; Office/test/unit/store/longTermMemoryStore.test.ts
regression_test_command: npm.cmd run test:run -- Office/test/unit/store/uiStore.test.ts Office/test/unit/store/longTermMemoryStore.test.ts; node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_calendar_action_batch_is_atomic_idempotent_and_tenant_scoped
last_verified_at: none
verified_against: none
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-AI-APPROVAL-001 - Approval could partially apply or drift from reviewed content

## Symptom

A multi-action AI plan could leave earlier writes committed after a later action failed, and the review drawer read live mutable state rather than an immutable snapshot.

## Trigger

Approve a multi-action plan with a failing later action, double-click apply, or change the active plan/project while the drawer is open.

## Evidence

Confirmed by code inspection: frontend actions were awaited sequentially and review data was read from live stores.

## Expected behavior

The exact reviewed snapshot commits once as one tenant-scoped transaction or makes no calendar changes.

## Root cause

Calendar writes used independent endpoints with no batch idempotency record; approval state held only a source label.

## Resolution

Added transactional action batches, per-user idempotency, immutable approval context, state reconciliation, and loaded-project gating.

## Verification

Linked regression cases exist but have not been run.

## Manual verification

Not applicable.

## Notes

MySQL concurrency coverage remains conditional.
