# Agent Task Log

Record substantial work only. Never store secrets, private keys, tokens, full transcripts, or unnecessary personal data.

## TASK-BOOTSTRAP-001 - Initialize office governance

- Date: bootstrap date
- Scope: Create the project agent-governance baseline.
- Outcome: `AGENTS.md` delegates to `Office/`; skill, scripts, records, templates, and governance tests are present.
- Validation: Run `Office/scripts/Test-OfficeGovernance.ps1` in the target project.
- Follow-up: Replace this line only if the project needs stricter domain-specific rules.

## TASK-AUDIT-20260812 - Incremental full-project audit and repair

- Date: 2026-08-12
- Scope: Audit the current web, FastAPI, database, Tauri, test, release, and governance layers on top of the 2026-08-10 baseline; repair confirmed defects without weakening server/desktop boundaries.
- Outcome: High- and medium-risk fixes were implemented for schema integrity, tenant/request isolation, transactional writes, stale async state, calendar relationships, timezone handling, strict DTOs, E2E database safety, desktop recovery, and deterministic test provenance. Evidence and intentionally skipped suites are recorded in `Office/audits/code-audit-2026-08-12.md`.
- Validation: Format, lint, 58-file/308-test Vitest, 504-module build, OpenAPI, 120-test backend (one expected MySQL skip), Rust check and 6 recovery tests, version, dependency audits, catalog provenance, Office governance, and `git diff --check` passed within the permitted local scope.
- Boundaries: No production database, real account, user backup, signing key, or real AI provider was used. MySQL/Server E2E, Docker, packaging, signing, and clean-machine recovery smoke were not run in this audit pass.
- Follow-up: Before release, rerun real MySQL/concurrency, Server E2E, packaging/signing, clean-machine recovery, and any explicitly approved Desktop E2E final smoke under their documented isolation prerequisites.

## TASK-ACTIVE-TOOL-UX-20260819 - Implement shared review-first activation

- Date: 2026-08-19
- Scope: Implement the Goal Planner and Fitness AI shared onboarding contract, clarification rules, recoverable draft review, transactional activation, workspace resume summary, local activation funnel, and controlled acceptance coverage.
- Outcome: AI Assistant is the default creation path, Template Library converges on the same review-first flow, invalid AI revisions preserve the prior valid draft, repeated approval is idempotent, and activation performs no calendar write.
- Validation: Format, lint, 59-file/315-test Vitest, 512-module build, OpenAPI migration through `20260819_0009`, 126-test backend run with two conditional skips, Rust, version, and catalog structure checks passed.
- Boundaries: No production data, real account, external analytics, real DeepSeek call, Docker/MySQL, Desktop E2E, packaging, signing, or publishing was used.
- Follow-up: With explicit approval, run the three quota-bounded DeepSeek cases, deterministic Desktop E2E, and disposable MySQL/Server E2E; then use the private funnel baseline before selecting a numeric completion target.

## TASK-ACTIVE-TOOL-UX-ACCEPTANCE-20260820 - Complete automated acceptance

- Date: 2026-08-20
- Scope: Run the deterministic Desktop flow and disposable MySQL/Server suite, repair failures exposed by the new Active Tool journey, and rerun the complete local quick gate.
- Outcome: Active Tool onboarding passes in a real Chromium desktop flow; exported backups containing Goal Control numbers survive Python/browser JSON round trips; Check-in tests isolate their project; MySQL activation rollback/idempotency/funnel isolation and server account isolation pass.
- Validation: Desktop E2E 10/10, MySQL contract 2/2, Server E2E 2/2, Vitest 59 files/315 tests, backend 127 tests with two expected conditional skips, 512-module build, format, lint, OpenAPI, Rust, version, catalog structure, Office governance self-tests, and `git diff --check` passed.
- Boundaries: Docker used only the documented disposable `calendar_test` lifecycle and removed its container, network, and volume. No production data, real account, DeepSeek call, signing key, packaging, publishing, or exact mixed-worktree provenance refresh was used.
- Follow-up: Obtain explicit paid-provider approval before the three quota-bounded DeepSeek cases; isolate the unrelated dirty worktree before refreshing exact catalog provenance or creating a checkpoint commit.

## TASK-LONG-TERM-DUE-DATE-20260829 - Add activation-safe action scheduling

- Date: 2026-08-29
- Scope: Repair the mismatch that allowed AI-generated Minimum and Standard actions without dates to reach backend activation, including the genuinely no-hard-deadline case.
- Outcome: Added deterministic action scheduling, rolling four-week semantics, flexible date provenance, one scheduling question per plan fingerprint, manual-entry highlighting, activation preflight, prompt alignment, and frontend/backend regression coverage. Backend strict validation remains the final guard.
- Validation: Focused automated validation is pending and will be recorded in `TC-LONG-TERM-DUE-DATE-001-v1`; no real provider, production database, Docker, packaging, signing, or publishing is in scope.
- Follow-up: Run the single focused frontend/backend/governance pass, stop on a serious failure, then update the linked known error and test ledger with the actual result.

## TASK-LONG-TERM-DUE-DATE-VALIDATION-20260829 - Record stopped focused verification

- Date: 2026-08-29
- Scope: Validate action scheduling and repair global TypeScript contract drift without using production data, real provider calls, Docker, packaging, signing, or publishing.
- Outcome: Related lint and the 516-module frontend build passed. Scheduler, onboarding, prompt, and AI Assistant tests passed. The first Goal Planner run exposed a missing manual-date choice and two obsolete date-input locators; the product choice and both locators were corrected.
- Validation: The latest Goal Planner run passed 4 of 5 cases and reached the manual-entry review, then failed on the second locator before it was corrected. No further product run was performed per the user's no-repeat instruction. Goal Control backend regression remains pending.
- Follow-up: With explicit approval, run the corrected Goal Planner file once, then the previously unstarted Goal Control backend file and governance checks; only then promote `ERR-LONG-TERM-DUE-DATE-001` to verified.

## TASK-LONG-TERM-NO-DEADLINE-MANUAL-20260829 - Record LT-02 activation failure

- Date: 2026-08-29
- Scope: Record the user-run LT-02 result for a long-term plan with no concrete hard deadline; do not modify product code or repeat the test.
- Outcome: LT-02 failed with `Plan dates must use YYYY-MM-DD.` and was linked to `ERR-LONG-TERM-NO-DEADLINE-002` and the existing confirmed rolling-plan contract.
- Evidence: Manual result at 2026-08-29T20:48:28-07:00 against working-tree@28245bb; read-only inspection confirmed the natural-language `policy.planning_brief.deadline` fallback path.
- Additional evidence: LT-07 reproduced the same `Plan dates must use YYYY-MM-DD.` symptom at 2026-08-29T21:11:32-07:00. The LT-07 input was not supplied, the test was not retried, and LT-06 remains unreported.
- Follow-up: Repair the effective-target normalization and add the linked frontend/backend regression before any verification claim or resumed LT-02 run.

## TASK-LONG-TERM-CAPACITY-MANUAL-20260829 - Record LT-03 capacity failure

- Date: 2026-08-29
- Scope: Record the user-run LT-03 result without changing product code or repeating activation.
- Outcome: LT-03 failed with a backend capacity error for a 240-minute required action against 144 buffered minutes; the returned week `2025-05-26` was already in the past.
- Evidence: Manual result at 2026-08-29T20:52:20-07:00 against working-tree@28245bb; read-only inspection found both the intended frontend capacity preflight and the backend final guard, but did not yet establish why the tested path reached the backend.
- Additional evidence: LT-05 independently reproduced the same English backend capacity failure at 2026-08-29T21:02:31-07:00 with 360 required minutes, 192 buffered minutes, three affected actions, and another past planning week. LT-04 has not been reported.
- Follow-up: Trace the captured LT-03 plan through preflight and activation, repair the mismatch and past-date handling, then add the linked regression before resuming manual testing.

## TASK-GLOBAL-TOOL-SCHEDULING-20260830 - Implement review-first global scheduling

- Date: 2026-08-30
- Scope: Replace independent active-tool date planning with a user-level deterministic scheduler, separate draft/active/editor workspaces, keep tool context inside daily AI conversations, and repair LT-01/LT-02/LT-03/LT-05/LT-07 contracts.
- Outcome: Added explicit work windows, cross-tool deterministic allocation around fixed events, scheduler-owned split event links, fingerprinted proposals, stale/idempotent atomic acceptance, rolling no-deadline dates, cumulative pre-deadline capacity, visible health factors, blank new-tool sessions, sticky tool context, and review-first active-tool edits.
- Validation: The single approved pass stopped at the first frontend failure as required. Vitest passed 57 of 58 tests across 8 of 9 files. `Office/test/integration/goalPlanner.test.tsx:644` still expected the superseded dialog name `Edit long-term plan and tool characteristics` after opening the new tool editor. Backend, lint, build, OpenAPI, Office governance, and `git diff --check` did not start, and no rerun was performed.
- Boundaries: The run used mocked frontend transports only. Docker, real MySQL, Server E2E, desktop packaging, real AI calls, production data, and user accounts were not used.
- Follow-up: Report this first failure to the user. Do not promote the scheduling or LT known errors to verified. A later explicitly approved pass must first align the editor integration assertion and scheduling proposal mocks, then run the still-unstarted backend and repository gates.

## TASK-GLOBAL-TOOL-SCHEDULING-VALIDATION-20260830 - Continue the stopped one-pass gate

- Date: 2026-08-30
- Scope: Align the Active Tool integration test with proposal-first editing, add deterministic scheduling endpoint mocks and store isolation, then continue the approved focused validation once without Docker, MySQL, server E2E, packaging, or real AI calls.
- Outcome: The revised frontend contract passed all 58 tests across 9 files, including the assertion that an active-tool edit leaves persisted metadata unchanged and creates a reviewable global proposal. The isolated backend stage then stopped with 1 failure and 5 errors across 39 tests.
- First serious diagnostic: Desktop migration candidates at revisions `20260715_0006` or `20260715_0007` run `audit(..., repair=True)` before Alembic upgrade. That audit selects the current `ActionEventLinkRecord`, which now requires `managed_by` and `proposal_id`; the old table does not contain those columns, so existing desktop databases fail safely with `sqlite3.OperationalError: no such column: action_event_links.managed_by`.
- Secondary diagnostic: `test_activation_rejects_standard_plan_above_buffered_capacity` did not raise. On the 2026-08-30 Sunday test date, a Monday deadline is counted as two full week buckets by `available_weeks`, even though only one day remains. This overstates pre-deadline capacity and reopens `ERR-LONG-TERM-CAPACITY-003` at a partial-week boundary.
- Validation: Focused Vitest 9/9 files and 58/58 tests passed. The isolated backend command ran 39 tests and failed with 1 failure plus 5 errors. Lint, build, OpenAPI, Office governance, and `git diff --check` did not start. No fix or rerun followed.
- Follow-up: Repair the revision-aware pre-upgrade integrity audit and calculate capacity from actual remaining executable time rather than whole calendar-week buckets. Then request one new validation pass; do not treat either contract as verified before it succeeds.

## TASK-GLOBAL-TOOL-SCHEDULING-BACKEND-REPAIR-20260830 - Repair migration and partial-week capacity

- Date: 2026-08-30
- Scope: Make the pre-upgrade desktop integrity audit revision-compatible and replace whole-week capacity counting with actual configured executable-day capacity, then run the approved affected backend and repository gate once.
- Outcome: The audit now reflects the candidate's real columns before Alembic upgrade, and capacity uses shared bilingual weekday normalization plus inclusive executable-day proration. The prior desktop missing-column and partial-week assertion failures did not recur in the next 42-test backend run. That command nevertheless failed with two global proposal acceptance errors, so the two target errors remain `fixed_unverified` rather than verified.
- First serious diagnostic: `GlobalSchedulingService._apply_proposal` stages a new `EventRecord` and its `ActionEventLinkRecord` in the same unit of work without an explicit relationship or event flush. SQLite attempted the action-event link insert while its new event parent was not yet present and raised `FOREIGN KEY constraint failed`. The proposal, project, and action parents already existed; the event was the only newly staged referenced parent.
- Validation: The affected backend command ran 42 tests and ended with 2 errors in global scheduling proposal acceptance. Format, lint, build, OpenAPI, Office governance, and `git diff --check` did not start. No fix or rerun followed.
- Safety: The failure occurred during transaction flush and the transaction rolled back. No partial accepted proposal, event, action link, or calendar batch write was established.
- Follow-up: Flush each newly created event before inserting its action-event link, retain the surrounding single transaction, and add an explicit rollback assertion for link-creation failure before requesting another validation pass.

## TASK-GLOBAL-TOOL-SCHEDULING-ATOMIC-REPAIR-20260830 - Verify proposal atomicity and stop at repository formatting

- Date: 2026-08-30
- Scope: Repair new-event/action-link insert ordering without splitting proposal acceptance, add a forced foreign-key rollback regression, and continue the approved affected validation exactly once.
- Outcome: New scheduler events are explicitly flushed before their links while remaining inside the single proposal transaction. The rollback regression confirms that a later link failure preserves pending proposal status and leaves no event, link, or calendar batch. The LT date, capacity, desktop migration, integrity audit, OpenAPI snapshot, and global scheduling regressions all completed successfully.
- Validation: The affected backend command passed 43/43 tests. The repository gate then stopped at `npm.cmd run format:check`, which reported 9 unformatted files: `Office/records/task-log.md`, three governance skill/template files, `Office/test/unit/components/Modal.test.tsx`, `Office/tests/test-catalog.json`, and `src/store/enabledToolRunner.ts`. Lint, build, OpenAPI check, Office governance, and `git diff --check` did not start. No automatic formatting or rerun followed.
- Boundaries: No frontend tests were repeated. No Docker, MySQL, Server E2E, desktop packaging, signing, publishing, production data, real account, or real AI call was used.
- Follow-up: Classify the 9 formatting findings against the dirty worktree, format only authorized in-scope files without altering semantics, then request one new repository-gate pass. The behavior regressions remain verified independently of this repository formatting blocker.

## TASK-GLOBAL-TOOL-SCHEDULING-FORMAT-CONTINUATION-20260830 - Clear formatting and identify the frontend boundary blocker

- Date: 2026-08-30
- Scope: Classify and mechanically format the nine files reported by the prior gate, then continue the remaining repository checks once without repeating product tests.
- Outcome: Three dirty implementation/governance files and six clean-baseline files were formatted explicitly; no other files were included. The format gate passed. Lint then confirmed that three global scheduling/AI components bypass the required hook boundary, one store import is unused, and one AI Assistant effect dependency is incomplete.
- Validation: `npm.cmd run format:check` passed. `npm.cmd run lint` stopped with eight errors and one warning. Build, OpenAPI check, both Office governance checks, and `git diff --check` did not start. The already-passed frontend 58/58 and backend 43/43 behavior tests were not repeated.
- Governance: Opened `ERR-GLOBAL-SCHEDULING-FRONTEND-BOUNDARY-006` with confirmed root cause and linked lint command. The LT and global scheduling behavior evidence remains passed; overall repository readiness remains blocked.
- Follow-up: Introduce hook-level facades for AI tool context, scheduling preferences, and global schedule proposals; remove the unused import; correct the effect dependencies; then request one new remaining-gate pass without rerunning behavior tests unless those changes alter tested behavior.

## TASK-GLOBAL-TOOL-SCHEDULING-HOOK-BOUNDARY-20260830 - Implement frontend orchestration facades

- Date: 2026-08-30
- Scope: Resolve the confirmed global scheduling frontend dependency-boundary failure without changing backend, schema, API, or deterministic scheduling behavior.
- Outcome: Added hook facades for AI tool context, scheduling preferences, and global proposals; migrated the three affected components; removed the unused AI store import; and added focused coverage for sticky tool context, invalid selection cleanup, work-window validation/save ordering, proposal decisions, and failed acceptance preservation.
- Validation: Pending the user-approved single pass. `TC-GLOBAL-SCHEDULING-001-v1` is temporarily stale and `ERR-GLOBAL-SCHEDULING-FRONTEND-BOUNDARY-006` is `fixed_unverified` until lint and the focused integration command pass.
- Boundaries: No backend, database, migration, OpenAPI, authentication, real provider, production data, Docker, MySQL, packaging, signing, or publishing change is included. Existing unrelated working-tree changes were preserved.
- Follow-up: Format only the touched files, run the approved gate sequence once, stop on the first failure, and record exact evidence without rerunning the backend or full frontend suite.

## TASK-GLOBAL-TOOL-SCHEDULING-HOOK-VALIDATION-20260830 - Stop at the Settings capability fixture

- Date: 2026-08-30
- Scope: Run the approved one-pass repository gate after the hook-boundary refactor, without backend or full frontend repetition.
- Outcome: Formatting and lint passed, confirming the frontend dependency boundary repair. Global Schedule Panel passed 3/3 scenarios, the AI Assistant file passed, and all existing Settings Panel cases passed. The two newly added scheduling-settings cases could not reach their target UI because the shared desktop test capability fixture sets no `globalScheduling` flag, while the product correctly renders that section only when the capability is true.
- Validation: The focused command completed 29/31 tests across 2/3 passing files and then failed. Build, OpenAPI, both Office governance checks, and `git diff --check` did not start. No test fixture change or rerun followed.
- Diagnosis: Confirmed test-entry mismatch, not a reproduced save/recompute product failure. The smallest next change is to opt only the two scheduling-settings cases into `globalScheduling: true`, preserving the shared default capability posture and all product guards.
- Follow-up: With a new explicit continuation, update only those test preconditions and run one new remaining-gate pass. Keep `ERR-GLOBAL-SCHEDULING-FRONTEND-BOUNDARY-006` at `fixed_unverified` and `TC-GLOBAL-SCHEDULING-001-v1` failed until the exact focused command passes.

## TASK-GLOBAL-TOOL-SCHEDULING-HOOK-CONTINUATION-20260830 - Verify hooks and stop at TypeScript build drift

- Date: 2026-08-30
- Scope: Enable `globalScheduling` only in the two scheduling-settings integration cases, then continue the remaining gate once without repeating lint, backend, or the full frontend suite.
- Outcome: The exact focused command passed 31/31 tests across all three files, so `TC-GLOBAL-SCHEDULING-001-v1` is restored to passed and `ERR-GLOBAL-SCHEDULING-FRONTEND-BOUNDARY-006` is verified. React emitted non-failing `act(...)` warnings in one AI Assistant case; no assertion or write-boundary failure occurred.
- Validation: `npm.cmd run build` then stopped at TypeScript compilation. The first diagnostic is `Office/test/support/setupTests.ts:26`, where the shared capability object lacks required `globalScheduling`. The same run also found project-summary `title` access against `{ project_id }`, an optional `dueDate` assigned to a non-optional editor field, and a widened `execution_tier` incompatible with its literal union. OpenAPI, both Office governance checks, and `git diff --check` did not start; no fix or rerun followed.
- Governance: Opened `ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007` as a reproduced high-severity release blocker. The scheduling behavior contract remains passed independently of repository build readiness.
- Follow-up: In a separately approved repair pass, normalize the four TypeScript contract groups, add the missing shared capability default, and resume from one production build without repeating already-valid behavior suites.

## TASK-GLOBAL-TOOL-SCHEDULING-TYPE-BUILD-REPAIR-20260830 - Restore production compilation

- Date: 2026-08-30
- Scope: Repair `ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007` using only the compiler-reported capability, activation-response, editor-date, and execution-tier contract boundaries.
- Outcome: The shared desktop test capability explicitly defaults global scheduling to disabled; activation notices use the reviewed plan title; optional action dates normalize to the editor's `null` representation; and the new-action tier keeps its literal-union type. No scheduling, approval, persistence, API, or calendar-write behavior changed.
- Validation: The single continuation build passed TypeScript and transformed 524 modules. The OpenAPI snapshot check passed through migration `20260829_0011`. Vite emitted non-blocking dynamic/static import and chunk-size warnings. Previously passed 31/31 hook-focused, 58/58 scheduling-focused frontend, and 43/43 affected backend evidence was not repeated.
- Governance: `ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007` is verified at evidence level A against working-tree@28245bb. Final Office governance and diff checks run immediately after this record update.
- Boundaries: No Docker, MySQL, Server E2E, desktop packaging, signing, publishing, production data, real account, or real AI call was used.

## TASK-GLOBAL-TOOL-SCHEDULING-GOVERNANCE-STOP-20260830 - Stop at stale test-catalog provenance

- Date: 2026-08-30
- Scope: Run the final Office governance and diff gates after the TypeScript build and OpenAPI checks passed.
- Outcome: The first Office governance script stopped because `Office/tests/test-catalog.json` still records worktree hash `a7f024979f1fa78523ffcc5b3dcda9bbbd403803adf42003ecb267f0d238a1a1`, while the current governed worktree requires `33f4c50de8bc2945d92f585f9e3564c786942750f9f3acbca2d3183e1698776a`.
- Classification: Confirmed provenance drift after authorized working-tree changes, not a product build, OpenAPI, scheduling, approval, or persistence failure.
- Validation boundary: The second Office governance script and `git diff --check` did not start. The catalog was not refreshed and no governance command was rerun.
- Follow-up: After the current changes are finalized, refresh the catalog provenance once, then resume with the two Office governance checks and `git diff --check`; do not repeat the already-passed focused tests, production build, or OpenAPI check.

## TASK-LONG-TERM-CAPACITY-PREFLIGHT-MANUAL-20260831 - Record generic editor activation-preflight failure

- Date: 2026-08-31
- Scope: Classify the two user-supplied manual screenshots and read-only isolated runtime evidence; do not implement a fix, retry activation, or run product tests.
- Outcome: Duplicate Monday work windows correctly displayed `mon 的工作时段不能重叠。`. The generic Tool Editor then sent a capacity-invalid long-term plan to activation instead of presenting the required one-question scheduling decision. One real AI completion occurred; the backend returned HTTP 422, and a subsequent read confirmed zero projects, so no active tool was created.
- Diagnosis: Confirmed path mismatch. `useGoalConversation.activate` calls activation directly, while `useActiveToolOnboarding` performs deterministic scheduling, blocking-issue evaluation, and fingerprinted `action_schedule` handling first. Recorded as `ERR-LONG-TERM-CAPACITY-PREFLIGHT-008` without reopening the verified capacity algorithm error.
- Boundaries: The draft conversation and messages remain only in the temporary manual-test database. No calendar event, active project, additional provider request, product-code change, product-test rerun, Docker, MySQL, packaging, signing, publishing, production data, or real account was used during diagnosis and recording.
- Follow-up: Extract or reuse one shared activation preflight for the generic editor, keep activation disabled while the decision is unresolved, and add one focused regression proving the activation endpoint is not called. Run that focused test only after implementation is explicitly authorized.

## TASK-LONG-TERM-CAPACITY-PREFLIGHT-REPAIR-20260831 - Verify generic editor activation preflight

- Date: 2026-08-31
- Scope: Repair ERR-LONG-TERM-CAPACITY-PREFLIGHT-008 without changing the backend, database, API, or global scheduling algorithm; preserve the dirty working tree and run one focused product test only.
- Outcome: Shared action-schedule context parsing and fingerprint detection now serve both onboarding paths. The generic editor schedules after plan generation or regeneration, resolves the one-question answer deterministically, blocks unresolved activation, and uses the complete plan review UI for manual date and capacity edits. The existing regenerate action remains available.
- Validation: Focused ESLint passed for the six changed implementation and test files. The single approved Vitest command passed 1/1 file and 3/3 tests; the new regression observed exactly one scheduling question and zero activation calls for a capacity-invalid draft. No product test was repeated.
- Governance: TC-LONG-TERM-DUE-DATE-001-v1 is restored to passed and ERR-LONG-TERM-CAPACITY-PREFLIGHT-008 is verified at evidence level B against working-tree@28245bb.
- Boundaries: No backend test, full frontend suite, build, OpenAPI check, Docker, MySQL, Server E2E, desktop packaging, signing, publishing, production data, real account, or real AI call was used.
- Follow-up: The user may now repeat the single manual capacity scenario. Expected behavior is one Chinese scheduling decision before activation; until it is resolved, no activation request or backend capacity error should appear.

## TASK-CHAIN-LIFECYCLE-REPAIR-20260920 - Repair tool and AI review flows

- Date: 2026-09-20
- Authority: User explicitly requested implementation of the approved four-part plan.
- Outcome: Tool resume, durable pending edits, transactional AI review state, stable message/operation identities, immutable approval snapshots, retry/session guards, and deployment head guidance implemented. No schema migration or deployment.
- Evidence: 35 frontend, 11 lifecycle backend, and 2 HTTP focused tests passed. Full frontend 350/353; full backend 137 passed, 1 failure, 14 errors, 2 skips. Remaining failures are pre-existing navigation assertions and fixed-date goal-control fixtures, documented with commands in the report.
- Preservation: A temporary checkpoint contains 107 original working files and the tracked binary diff. Existing user changes were retained.
- Detail: Office/records/chain-lifecycle-repair-20260920.md and TC-CHAIN-LIFECYCLE-001-v1.

## TASK-SHARED-INVITE-20260920 - Implement shared invitation registration and prepare Linux deployment

- Date: 2026-09-20
- Outcome: Server registration, separate persisted throttles, ordinary-user-only atomic creation, frontend form and API contract implemented. Added independent Calendar systemd/Nginx/environment templates and Linux runbook. No migration or live deployment.
- Validation: 10 backend registration + 13 authentication frontend tests passed; final related frontend run 48/48. Full frontend 357/360; full backend 147 passed, 1 failure, 14 errors, 3 skips. Remaining failures match the earlier unrelated navigation and fixed-date fixtures.
- Preservation: 118 original working files snapshotted and checksum verified; no original files deleted. No secrets recorded or production calls made.
- Follow-up: Actual subdomain and authorized SSH connection; approved disposable MySQL and Server E2E; target Linux configuration checks and existing test failures before release.
- Detail: Office/records/shared-invite-registration-20260920.md.

## TASK-CALENDAR-SUBPATH-SSH-20260920 - Prepare confirmed path and inspect server directly

- Connected through the existing SSH identity; confirmed server state without asking the user to run more inventory commands. No live deployment or production writes.
- Implemented `/calendar/` API/build support and isolated service/Nginx templates; preserved old server files and local uncommitted changes.
- Validation: 92 focused frontend + 10 invitation backend passed, both builds/Lint/OpenAPI passed, mocked production-artifact browser flow passed, target Nginx snippet syntax passed with no reload.
- Prepared a secret-free candidate archive with file hashes; no upload. Server database approval, existing full-suite failures and exposed legacy AI credential remediation remain release conditions.
- Detail: Office/records/calendar-subpath-ssh-20260920.md; TC-SERVER-SUBPATH-001-v1.

## TASK-CALENDAR-LIVE-20260920 - Deploy Calendar after approved disposable validation

- User approved temporary MySQL resources and cleanup. Native MySQL 5/5 and server browser 3/3 passed; resources, temporary credentials and tunnel removed.
- Fixed Windows-only dependency lock for Linux with unchanged original versions; corrected stale date/navigation tests without weakening business assertions. Complete frontend 365/365 and local backend 162 passed plus 5 separately passing MySQL cases.
- Deployed calendar-20260920T180036Z to the confirmed HTTPS path. Shared invitation registration enabled in private server config. Database head/integrity, service, proxy/public health and read-only browser checks passed. Existing services preserved.
- Old secret-bearing static pages no longer public. AI remains disabled pending new backend key and old-key revocation. Six development-only dependency advisories remain documented.
- Detail: Office/records/calendar-live-deployment-20260920.md; TC-SERVER-RELEASE-001-v1; ERR-LINUX-DEPENDENCY-001.

## 2026-09-20 网页个人 API 配置与发布

完成每账号独立的 DeepSeek 设置入口、加密持久化、后端请求选取、账号切换响应保护、迁移和接口文档。通过隔离 MySQL/浏览器验证后上线，保留数据库与私密配置备份。具体发布、测试及两个已复现的既有容量测试失败见 [个人 API 发布记录](personal-ai-web-20260920.md)，测试证据见 TC-PERSONAL-AI-001-v1。

- 2026-09-21: Fixed the reported personal-key reasoning plan truncation; reproduced 3000-token backend and 1024-token frontend caps before correction. Regression evidence: TC-AI-OUTPUT-001-v1. Production release and verification are recorded in ai-output-budget-20260921.md.
