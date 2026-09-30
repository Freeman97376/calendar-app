---
known_error_version: 1
id: ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007
status: fixed_unverified
severity: high
reported_at: 2026-08-30T20:26:56.3579855-07:00
resolved_at: 2026-08-30
root_cause_status: confirmed
regression_test_case: TC-GLOBAL-SCHEDULING-001-v1
regression_test_path: Office/test/support/setupTests.ts; src/hooks/useActiveToolOnboarding.ts; src/hooks/useGoalConversation.ts; src/hooks/useEnabledTools.ts; src/store/enabledToolRunner.ts
regression_test_command: npm.cmd run build
last_verified_at: 2026-08-30T21:21:27.1945287-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007 - Global scheduling working tree does not compile

## Symptom

The production frontend build stops during TypeScript compilation, so the current global scheduling working tree cannot produce a release artifact.

## Trigger

Run `npm.cmd run build` against working-tree@28245bb after the hook-boundary focused tests pass.

## Evidence

Reproduced on 2026-08-30. The first compiler diagnostic is `Office/test/support/setupTests.ts:26`: the shared capability object lacks the now-required `globalScheduling` field. The same run reports four further contract groups in `useActiveToolOnboarding.ts`, `useEnabledTools.ts`, `useGoalConversation.ts`, and `enabledToolRunner.ts`.

## Expected behavior

All runtime and test fixtures satisfy the current capability, project summary, plan editor, and action DTO types, and `npm.cmd run build` completes before OpenAPI or release gates continue.

## Root cause

Confirmed at the TypeScript contract level. The global scheduling changes made `globalScheduling` required without updating the shared test capability object; two hooks read `title` from a narrowed `{ project_id }` project summary; editor mapping permits `dueDate: undefined` where only `string | null` is accepted; and an action mapping widens `execution_tier` from its literal union to `string`. The causal history of each drift has not been investigated beyond the compiler evidence.

## Resolution

Implemented without changing runtime behavior. The shared desktop test capability now explicitly defaults `globalScheduling` to false; activation notices use the already-reviewed plan title instead of assuming an expanded response DTO; editor dates normalize `undefined` to `null`; and the new-action default execution tier retains its literal-union type.

## Verification

Verified at evidence level A against working-tree@28245bb. Before the repair, the exact `npm.cmd run build` command reproduced the five TypeScript contract groups and stopped before Vite. After the repair, the same command completed TypeScript compilation and a 524-module production build. The linked scheduling case remains passed, and `npm.cmd run openapi:check` also confirmed the signed-in API snapshot is current. Previously passed behavior suites were not repeated because the edits preserve the same runtime values.

## Manual verification

Not applicable. No waiver has been requested or approved.

## Notes

The exact three-file hook-focused command passed 31/31 tests, and the hook boundary known error is independently verified. Vite still reports non-blocking chunk-structure and size warnings; no compiler or OpenAPI error remains. Final Office governance and diff checks are recorded by the enclosing task handoff.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
