---
known_error_version: 1
id: ERR-LONG-TERM-CAPACITY-PREFLIGHT-008
status: fixed_unverified
severity: medium
reported_at: 2026-08-31T13:04:31.7889071-07:00
resolved_at: 2026-08-31
root_cause_status: confirmed
regression_test_case: TC-LONG-TERM-DUE-DATE-001-v1
regression_test_path: Office/test/integration/goalConversationAnchoring.test.tsx
regression_test_command: npm.cmd run test:run -- Office/test/integration/goalConversationAnchoring.test.tsx
last_verified_at: 2026-08-31T18:53:07.0662190-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-LONG-TERM-CAPACITY-PREFLIGHT-008 - Generic tool editor bypasses activation capacity preflight

## Symptom

The generic new-tool editor submits a capacity-invalid plan to activation and displays the backend's Chinese capacity rejection. It does not first present the required single consolidated scheduling decision with calculated alternatives.

## Trigger

Configure a narrow global work window, create a long-term plan whose unfinished Minimum or Standard actions exceed the available time before the target date, and attempt activation from the generic tool editor.

The 2026-08-31 manual case required 1590 minutes by 2026-09-28, while the calculated four executable days supplied 768 minutes. The backend calculated that weekly capacity must be at least 497 minutes and identified the affected actions.

## Evidence

The user supplied a screenshot of the visible capacity rejection. Read-only local runtime evidence showed one successful AI completion request followed by an activation request that returned HTTP 422. A subsequent project read returned zero projects, so the final backend guard prevented creation of an active tool. The draft conversation and messages remain only in the isolated temporary manual-test database.

The same manual session separately displayed `mon 的工作时段不能重叠。` for duplicate Monday work windows. That confirms the overlapping-window validation message is reachable; it does not verify the save or recompute path.

## Expected behavior

Before activation, the editor must run the deterministic schedule preflight. If capacity is insufficient, it must ask at most one consolidated `action_schedule` question for the plan fingerprint and offer the calculated earliest feasible target, minimum required weekly capacity, explicit Stretch candidates, or manual handling. While unresolved, it must not call the activation endpoint.

## Root cause

Confirmed by read-only code inspection. `useGoalConversation.activate` calls the Goal Control activation gateway directly. Unlike `useActiveToolOnboarding`, it does not run the shared deterministic scheduling step, evaluate blocking issues, or enter the fingerprinted one-question scheduling flow before the request. The generic tool-editor route therefore sits outside the implemented activation-preflight boundary.

## Resolution

Implemented. The generic conversation hook now uses the same deterministic scheduler, persisted action-schedule context, fingerprint duplicate guard, answer resolver, and blocking-issue check as Active Tool onboarding. Plan generation and regeneration also run the preflight before presenting a review.

The generic editor now reuses the complete plan review UI, including target and action dates, weekly capacity, execution tier, priority, and inline required-date state. Unresolved capacity, date, dependency, or structure issues disable approval. The backend activation request is sent only after the deterministic result is ready and all blocking issues are clear.

## Verification

Verified at evidence level B against working-tree@28245bb. The pre-fix manual evidence showed the capacity rejection after an HTTP 422 activation request. The post-fix focused command completed once with 1/1 file and 3/3 tests passing. Its new regression opens a capacity-invalid draft, requests activation, observes exactly one action-schedule question, confirms the approval button becomes disabled, and asserts that the activation endpoint received zero calls.

The exact command was: npm.cmd run test:run -- Office/test/integration/goalConversationAnchoring.test.tsx. Focused ESLint also passed for all six changed implementation and test files. No backend, full frontend, build, Docker, MySQL, or real-provider test was repeated.

## Manual verification

Not applicable. No waiver has been requested or approved. The earlier failed manual result remains recorded under Evidence.

## Notes

This remains separate from the verified due-week capacity algorithm error `ERR-LONG-TERM-CAPACITY-003`. The current change repairs only the generic editor's missing pre-activation decision flow.

One real configured AI request occurred during this manual session. No further provider call was made during diagnosis or governance recording.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
