---
test_case_version: 1
id: TC-LONG-TERM-DUE-DATE-001-v1
type: functional
spec_status: confirmed
execution_status: stale
version: 1
supersedes: none
superseded_by: none
purpose_status: confirmed
process_status: confirmed
expected_result_status: confirmed
confirmed_at: 2026-08-29T11:17:53-07:00
confirmed_by: user
source_kind: known-error
source_ids: ERR-LONG-TERM-DUE-DATE-001; ERR-LONG-TERM-NO-DEADLINE-002; ERR-LONG-TERM-CAPACITY-003; ERR-LONG-TERM-CAPACITY-PREFLIGHT-008
test_path: Office/test/unit/domain/goalActionScheduling.test.ts; Office/test/unit/domain/activeToolOnboarding.test.ts; Office/test/unit/domain/goalPlanningPrompt.test.ts; Office/test/unit/domain/scheduling.schema.test.ts; Office/test/integration/goalConversationAnchoring.test.tsx; Office/test/integration/goalPlanner.test.tsx; Office/test/backend/test_goal_control.py; Office/test/backend/test_global_scheduling.py
test_command: npm.cmd run test:run -- Office/test/integration/goalConversationAnchoring.test.tsx
last_verified_at: 2026-09-20T18:11:31.579227+00:00
verified_against: covered-files-sha256:3180b7436fe3ab9250e0a7b31d294586d8cbc7e38b9ad7e884263f5d81cc2b52
coverage_paths: src/domain/logic/goalActionScheduling.ts; src/domain/logic/activeToolOnboarding.ts; src/domain/logic/goalPlanningPrompt.ts; src/hooks/useActiveToolOnboarding.ts; src/hooks/useGoalConversation.ts; src/components/ai/InitialPlanReview.tsx; backend/goal_control.py
contract_ids: required-action-planning-date; rolling-plan-date-provenance; one-schedule-question; activation-fail-closed
---

# TC-LONG-TERM-DUE-DATE-001-v1 - Necessary actions receive valid planning dates before activation

## Purpose

Prevent a generated long-term plan from reaching activation with undated unfinished Minimum or Standard actions, while supporting honest rolling plans when the user has no hard deadline.

## Preconditions

Use the deterministic frontend scheduler, mocked Goal Control transport, and an isolated backend SQLite test database. Do not call a real AI provider or production database.

## Process

Generate the five-action plan from the reported failure with null action dates. Exercise a bounded plan, a genuinely open-ended rolling plan, manual-date entry, dependency and capacity conflicts, and a direct backend activation request that bypasses the frontend.

## Expected result

Valid existing dates remain unchanged. Missing dates are filled in dependency order within buffered capacity and target bounds. With no hard deadline, near-term work receives flexible system-planned dates inside a rolling four-week horizon and eligible overflow becomes undated Stretch work. If scheduling cannot be derived, exactly one consolidated scheduling question appears for the plan fingerprint; unresolved or manual cases remain blocked and never call activation. A direct invalid backend request is still rejected, while an undated Stretch action is accepted.

## Actual result

The 2026-08-30 backend repair pass ran the affected Goal Control coverage as part of a 42-test command. No LT date or capacity failure was listed, but the same command failed with two global action-event-link errors. Because the command did not complete successfully, the LT case remains failed overall and the corrected capacity/no-deadline errors remain unverified.

The approved continuation pass on 2026-08-30 passed all 58 focused frontend tests, including all eight `goalActionScheduling` cases and the complete Goal Planner flow. The isolated backend stage then failed. `test_activation_rejects_standard_plan_above_buffered_capacity` did not raise because a Sunday-to-Monday deadline crossed a week boundary and the cumulative validator counted both calendar weeks as fully available. Five desktop migration tests also errored before later backend and repository gates could run. The capacity contract is therefore still failed and `ERR-LONG-TERM-CAPACITY-003` is reopened as reproduced. No fix or rerun followed.

The 2026-08-30 single-pass verification also failed before backend coverage. Focused Vitest passed 57 of 58 tests across 8 of 9 files, including all eight `goalActionScheduling` cases and the dedicated scheduling schema and tool editor cases. The remaining `goalPlanner` integration failed at `Office/test/integration/goalPlanner.test.tsx:644` because it still expected the previous editor dialog accessible name after the workspace split. The command stopped at that first failure; `Office.test.backend.test_goal_control` and `Office.test.backend.test_global_scheduling` did not start, and no rerun was performed. Consequently LT-02/LT-03/LT-05/LT-07 remain resolved pending verification rather than verified.

Failed verification. The complete frontend build passed. The combined frontend run passed 45 of 47 tests, including all scheduler, onboarding, prompt, and AI Assistant cases. After adding the missing manual-date choice and correcting the first locator, the focused Goal Planner rerun passed 4 of 5 cases; the manual-date flow reached the post-answer review, then the final assertion failed on a second obsolete label locator. That locator has been corrected without another run. The backend regression did not start because the command stopped on the frontend failure.

Manual LT-02 also failed on 2026-08-29. When the user explicitly selected a plan with no concrete deadline and attempted activation, the UI surfaced the English backend error `Plan dates must use YYYY-MM-DD.` instead of activating an honest rolling plan. Subsequent cases were stopped and the activation was not retried.

Manual LT-03 failed on 2026-08-29. A 240-minute Minimum/Standard action was placed in a week with only 144 buffered minutes, and the UI surfaced the English backend capacity error for week `2025-05-26`. The conflict was not converted into the required single pre-activation scheduling decision, and the displayed week was already in the past relative to the test date.

Manual LT-05 reproduced the same failure with multiple actions: 360 Minimum/Standard minutes were assigned to a week with only 192 buffered minutes. The UI exposed the English backend error for `Review database schema`, `Implement migration`, and `Verify data integrity` in week `2025-04-07`, rather than presenting one pre-activation capacity decision.

Manual LT-07 also failed with `Plan dates must use YYYY-MM-DD.` The exact scenario input was not supplied, so the result is linked to the existing date-parsing error without inferring additional trigger details. LT-07 was not retried.

Manual generic Tool Editor capacity preflight failed on 2026-08-31. With 1590 required minutes due by 2026-09-28 and only 768 minutes available across four executable days, the UI surfaced the backend's Chinese capacity rejection after an activation request instead of asking one consolidated scheduling question before activation. The backend returned HTTP 422 and a subsequent read showed zero projects, so activation failed closed and no active tool was created. This editor-path defect is tracked separately as `ERR-LONG-TERM-CAPACITY-PREFLIGHT-008`; no retry followed.

The approved 2026-08-31 repair then passed the single focused generic-editor regression: 1/1 file and 3/3 tests. The new capacity-invalid draft case observed one consolidated scheduling question, a disabled approval button after the conflict was identified, and zero activation endpoint calls. Together with the unchanged historical 58/58 frontend scheduling coverage and 43/43 affected backend coverage, this restores the confirmed activation-fail-closed contract.

## Evidence

Latest backend evidence: the 42-test affected backend command on 2026-08-30 produced no listed failure in `test_goal_control`, but exited nonzero on two `test_global_scheduling` errors. Per governance, absence from another failing combined command is not recorded as a passing regression command. No additional test was run.

Continuation evidence: focused Vitest passed 9/9 files and 58/58 tests from 2026-08-30T00:56:35-07:00 against working-tree@28245bb. The isolated backend command then ran 39 tests and ended with 1 failure and 5 errors. The capacity failure was `Office/test/backend/test_goal_control.py:151`, where `GoalControlValidationError` was not raised for 210 required minutes against 160 buffered weekly minutes with a next-day deadline crossing into Monday. Later gates did not run, and no rerun was performed.

Latest automated evidence: the focused Vitest command ran once from 2026-08-30T00:28:49-07:00 to 2026-08-30T00:29:38-07:00 against working-tree@28245bb. Result: 8 of 9 files and 57 of 58 tests passed; first failure at `Office/test/integration/goalPlanner.test.tsx:644`; backend and later gates not run. Per the user's stop-on-failure instruction, the assertion was not changed and the command was not repeated.

Commands: `npm.cmd run build`; `npm.cmd run test:run -- Office/test/unit/domain/goalActionScheduling.test.ts Office/test/unit/domain/activeToolOnboarding.test.ts Office/test/unit/domain/goalPlanningPrompt.test.ts Office/test/integration/goalPlanner.test.tsx Office/test/integration/aiAssistant.test.tsx`; `npm.cmd run test:run -- Office/test/integration/goalPlanner.test.tsx`. Environment: local Windows test runtime with mocked AI transport and no production data or real provider. Latest execution: 2026-08-29T16:50:32-07:00 against working-tree@28245bb. Evidence level C: relevant deterministic units passed and the product flow reached manual entry, but the corrected final assertion and backend guard remain unverified.

Manual evidence: user-reported LT-02 result at 2026-08-29T20:48:28-07:00 against working-tree@28245bb. The exact displayed error was `Plan dates must use YYYY-MM-DD.` Read-only code inspection traced this message to the effective activation target fallback: a null root `target_date` can fall back to free-text `policy.planning_brief.deadline`. No automated or manual rerun was performed after this failure.

Manual evidence: user-reported LT-03 result at 2026-08-29T20:52:20-07:00 against working-tree@28245bb. The exact displayed error was `Week 2025-05-26 requires 240 Minimum/Standard minutes, exceeding the buffered weekly capacity of 144 minutes for 实现新版接口核心逻辑.` Read-only inspection confirmed that the current frontend scheduler contains a capacity-conflict branch, while the backend activation guard emitted this message. The reason the tested path bypassed or diverged from the frontend branch is not yet confirmed. No retry or automated product test was run.

Manual evidence: user-reported LT-05 result at 2026-08-29T21:02:31-07:00 against working-tree@28245bb. The exact displayed error was `Week 2025-04-07 requires 360 Minimum/Standard minutes, exceeding the buffered weekly capacity of 192 minutes for Review database schema, Implement migration, Verify data integrity.` This is a second reproduction of `ERR-LONG-TERM-CAPACITY-003`; LT-05 was not retried and LT-04 remains unreported.

Manual evidence: user-reported LT-07 result at 2026-08-29T21:11:32-07:00 against working-tree@28245bb. The displayed error exactly matched LT-02: `Plan dates must use YYYY-MM-DD.` This is a second symptom reproduction of `ERR-LONG-TERM-NO-DEADLINE-002`; no product test or retry was performed, and LT-06 remains unreported.

Manual evidence: user-supplied screenshots and isolated local runtime observations from 2026-08-31 against working-tree@28245bb. Duplicate Monday windows displayed `mon 的工作时段不能重叠。`. In the capacity case, one real AI completion returned successfully, the subsequent activation request returned HTTP 422, and the project collection remained empty. The visible calculation was 1590 required minutes, 768 available minutes across four executable days, and at least 497 weekly minutes required. No automated product test, activation retry, or additional provider call was performed.

Latest automated evidence: `npm.cmd run test:run -- Office/test/integration/goalConversationAnchoring.test.tsx` completed once on 2026-08-31 with 1/1 file and 3/3 tests passing against working-tree@28245bb. The added regression asserted exactly one persisted action-schedule question and zero activation calls for a capacity-invalid draft. Focused ESLint passed for the six changed implementation and test files. Evidence level B: credible manual pre-fix reproduction plus a passing post-fix regression. No real AI provider, backend suite, full frontend suite, production build, Docker, MySQL, production data, or user account was used.

## Confirmation

The user approved the implementation plan and confirmed that a genuinely absent hard deadline must be supported without fabricating one.

## Notes

Planning dates are scheduling commitments for the current plan, not claims that the user supplied a hard deadline.

The LT-02 failure is tracked separately as `ERR-LONG-TERM-NO-DEADLINE-002`; it remains within this confirmed case's existing rolling-plan contract.

The LT-03 failure is tracked as `ERR-LONG-TERM-CAPACITY-003`. Its pre-activation interception gap and past-week date both require regression coverage before verification.

LT-05 is additional evidence for the same error and confirms that the failure affects both a single oversized action and cumulative weekly action load.

LT-07 is additional evidence for the date-parsing error. Its unspecified input is deliberately not used to expand the confirmed acceptance contract or root-cause claim.

The approved repair is now implemented but remains unverified: root target dates no longer fall back to descriptive planning text, expired flexible system dates are rolled from the user's current date, cumulative capacity can use all weeks before a deadline, and the global scheduler validates real free time before proposing calendar changes. This paragraph records implementation state only; it does not replace the failed manual evidence above.

The 2026-08-31 reproduction did not reopen the verified capacity algorithm repair. The generic Tool Editor now shares deterministic preflight and one-question handling with `useActiveToolOnboarding`; the focused regression verifies this editor boundary.

## Evidence invalidation — 2026-09-20

Covered implementation changed during the lifecycle repair. Earlier evidence is historical; this case is stale until its complete contract is reverified. New lifecycle-specific coverage is recorded in TC-CHAIN-LIFECYCLE-001-v1. Full-suite known baseline failures are documented in the repair report.

## Linux release revalidation — 2026-09-20

Reverified 2026-09-20T18:11:31.579227+00:00; covered-files-sha256:3180b7436fe3ab9250e0a7b31d294586d8cbc7e38b9ad7e884263f5d81cc2b52. Complete frontend 365/365 and local backend 162 passed, with 5 MySQL tests skipped locally and passed separately on the authorized Linux test database. Three server browser tests passed. Date fixtures now remain valid relative to the test date; fixed-date timezone cases and business assertions were retained. Additional concurrency/cleanup evidence is recorded in TC-SERVER-RELEASE-001-v1. Earlier unrun-gate and full-suite-failure statements above are historical and superseded by this run.

2026-09-20: latest full backend run reports two existing date-dependent capacity tests failing on both the new runtime and previous release. Previous broad pass is not a current full-suite result. See ERR-CAPACITY-DATE-FIXTURE-001 and personal-ai-web-20260920.md.
