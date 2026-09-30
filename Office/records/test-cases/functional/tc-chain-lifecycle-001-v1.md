---
test_case_version: 1
id: TC-CHAIN-LIFECYCLE-001-v1
type: functional
spec_status: confirmed
execution_status: stale
version: 1
supersedes: none
superseded_by: none
purpose_status: confirmed
process_status: confirmed
expected_result_status: confirmed
confirmed_at: 2026-09-20
confirmed_by: user
source_kind: known-error
source_ids: ERR-CHAIN-LIFECYCLE-001
test_path: Office/test/backend/test_chain_lifecycle.py; Office/test/backend/test_auth_api.py; Office/test/unit/store/aiPlanLifecycle.test.ts; Office/test/unit/store/schedulingStore.test.ts; Office/test/integration/aiAssistant.test.tsx
test_command: npm.cmd run test:run -- Office/test/unit/store/aiPlanLifecycle.test.ts Office/test/unit/store/schedulingStore.test.ts Office/test/integration/aiAssistant.test.tsx Office/test/integration/globalSchedulePanel.test.tsx Office/test/integration/toolPlanEditor.test.tsx; node scripts/run-python.mjs -m unittest discover Office/test/backend -p test_chain_lifecycle.py; node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_calendar_action_batch_is_atomic_idempotent_and_tenant_scoped Office.test.backend.test_auth_api.AuthApiTests.test_ai_review_apply_copy_reload_and_dismiss
last_verified_at: 2026-09-20T18:11:31.579227+00:00
verified_against: covered-files-sha256:2ebe0c53cec3a455b3f6b04fc6cbf8bd59391abc8ebd1d06404ea16e6b35fad7
coverage_paths: backend/scheduling.py; backend/ai_plan_review.py; backend/user_transaction.py; backend/goal_control.py; backend/goal_control_api.py; backend/calendar/repository.py; backend/server.py; src/store/aiStore.ts; src/store/schedulingStore.ts; src/hooks/useAI.ts; src/hooks/useEnabledTools.ts; src/store/uiStore.ts; src/components/ai/AIAssistantPanel.tsx; src/components/workspace/ApprovalDrawer.tsx; src/components/tools/EnabledToolsPanel.tsx; src/services/goalControlClient.ts; src/domain/schemas/aiPlanReview.schema.ts; src/domain/schemas/calendarActionBatch.schema.ts; Office/test/backend/test_chain_lifecycle.py; Office/test/backend/test_auth_api.py; Office/test/unit/store/aiPlanLifecycle.test.ts; Office/test/unit/store/schedulingStore.test.ts; Office/test/integration/aiAssistant.test.tsx; Office/test/support/mocks/handlers.ts
contract_ids: resumable-active-tools; preserved-pending-edit; durable-ai-review; independently-idempotent-ai-operations; session-isolation
---

# TC-CHAIN-LIFECYCLE-001-v1 - Durable tool and AI review lifecycles

## Purpose

Prevent an approved tool state or AI plan from becoming stuck, disappearing, or executing twice after refresh, retry, or concurrent review.

## Preconditions

Use temporary SQLite databases, synthetic users, mocked AI responses, and isolated Vitest state. No production data, real accounts, paid AI calls, Docker, or MySQL.

## Process

1. Pause and complete a tool, approve each change, then resume it and approve.
2. Edit a tool, recompute after calendar changes, reject a conflicting edit, and verify the original patch survives. Exercise stale snapshots and changed plan versions.
3. Save an AI plan with stable IDs. Apply it, retry with another caller key, reload its conversation, and copy to tasks independently. Exercise dismissal and legacy history.
4. Inject a second-action failure and simultaneous acceptance; verify transaction rollback and once-only writes. Switch users while saves or loads are pending; verify no stale state enters the new session.

## Expected result

State changes require review and apply atomically. Pending tool changes survive every recompute and block replacement until accepted or rejected. Each AI operation writes once. Applied/dismissed/legacy plans never restore as executable pending plans. Cross-user requests fail without writes.

## Actual result

Passed: 35 focused frontend tests, 11 new backend lifecycle tests, and 2 HTTP contract tests (48 total). Full frontend: 350 passed, 3 pre-existing navigation assertions failed. Full backend: 137 passed, 1 failure, 14 errors, 2 skips; all remaining failures are the existing fixed-date goal-control fixture. See the linked report for exact diagnostics and limits.

## Evidence

Commands: `npm.cmd run test:run -- Office/test/unit/store/aiPlanLifecycle.test.ts Office/test/unit/store/schedulingStore.test.ts Office/test/integration/aiAssistant.test.tsx Office/test/integration/globalSchedulePanel.test.tsx Office/test/integration/toolPlanEditor.test.tsx; node scripts/run-python.mjs -m unittest discover Office/test/backend -p test_chain_lifecycle.py; node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_calendar_action_batch_is_atomic_idempotent_and_tenant_scoped Office.test.backend.test_auth_api.AuthApiTests.test_ai_review_apply_copy_reload_and_dismiss`. Windows, local project Python environment, temporary SQLite and MSW. Verified at 2026-09-20T08:10:16.853059+00:00, covered-files-sha256:24a910a78a2394c7771c8238d272bf99acdfb5c2ef011cac220f200af05ce604. Core regression evidence is level A: six failures/errors before fixes, then passing; additional concurrency and session-boundary coverage is level B. [Report](../../chain-lifecycle-repair-20260920.md).

## Confirmation

The user explicitly requested implementation of the plan including the listed test scenarios, chose read-only legacy plans, one pending tool edit at a time, and independent once-only apply/copy operations on 2026-09-20.

## Notes

This case does not establish MySQL concurrency or production readiness. MySQL and Server E2E remain not run and require an approved disposable environment. The fingerprint covers the listed implementation and test files, excluding this self-referential record.

## Reverification after shared invitation change

2026-09-20T16:51:49.384485+00:00: `backend/server.py` changed for registration. The final 48-test focused frontend run included all 35 lifecycle frontend tests, which passed; `npm.cmd run test:backend` passed the 11 lifecycle and 2 HTTP cases, with only the previously documented goal-control failures. Specification unchanged. Current covered state: covered-files-sha256:2ebe0c53cec3a455b3f6b04fc6cbf8bd59391abc8ebd1d06404ea16e6b35fad7. See `Office/records/shared-invite-registration-20260920.md`.

## Linux release revalidation — 2026-09-20

Reverified 2026-09-20T18:11:31.579227+00:00; covered-files-sha256:2ebe0c53cec3a455b3f6b04fc6cbf8bd59391abc8ebd1d06404ea16e6b35fad7. Complete frontend 365/365 and local backend 162 passed, with 5 MySQL tests skipped locally and passed separately on the authorized Linux test database. Three server browser tests passed. Date fixtures now remain valid relative to the test date; fixed-date timezone cases and business assertions were retained. Additional concurrency/cleanup evidence is recorded in TC-SERVER-RELEASE-001-v1. Earlier unrun-gate and full-suite-failure statements above are historical and superseded by this run.

2026-09-20 personal AI update: covered files changed; prior narrow fingerprint remains historical. New feature/whole-suite evidence is recorded in TC-PERSONAL-AI-001-v1. This record is not promoted solely by an overlapping suite run.
