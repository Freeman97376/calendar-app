---
test_case_version: 1
id: TC-GLOBAL-SCHEDULING-001-v1
type: functional
spec_status: confirmed
execution_status: stale
version: 1
supersedes: none
superseded_by: none
purpose_status: confirmed
process_status: confirmed
expected_result_status: confirmed
confirmed_at: 2026-08-29
confirmed_by: user
source_kind: architecture-decision
source_ids: PRODUCT-GLOBAL-TOOL-SCHEDULING-001
test_path: Office/test/unit/domain/scheduling.schema.test.ts; Office/test/integration/goalConversationAnchoring.test.tsx; Office/test/backend/test_global_scheduling.py
test_command: npm.cmd run test:run; node scripts/run-python.mjs -m unittest discover Office/test/backend
last_verified_at: 2026-08-30T21:21:27.1945287-07:00
verified_against: working-tree@28245bb
coverage_paths: backend/scheduling.py; backend/server.py; backend/database.py; src/services/schedulingService.ts; src/store/schedulingStore.ts; src/components/tools/GlobalSchedulePanel.tsx; src/components/settings/SchedulingSettings.tsx
contract_ids: fixed-calendar-occupancy; scheduler-owned-future-events; stale-proposal-atomicity; sticky-tool-context; separated-tool-workspaces
---

# TC-GLOBAL-SCHEDULING-001-v1 - Active tools share one review-first schedule

## Purpose

Prove that active tools do not plan calendar time independently and that no schedule mutation occurs before a current, user-approved global proposal.

## Preconditions

Use deterministic frontend services and a temporary SQLite backend. Configure an explicit timezone and weekly work windows. Create two active tools and at least one ordinary fixed calendar event. Do not call an AI provider or use personal data.

## Process

Recompute a schedule, inspect action/project provenance and time blocks, accept it, replay the acceptance, invalidate another proposal with a calendar change, and attempt to inject deletion of an unmanaged event. Exercise the blank tool editor and scheduling preference schemas.

## Expected result

Cross-tool blocks never overlap, fixed and recurring occupancy is avoided, dependencies and action provenance remain stable, and only future scheduler-owned events can change. Acceptance is atomic and idempotent. Stale input returns 409 with a latest proposal and no partial write. Missing work windows yield one setup-required state. Starting a new tool remains blank while drafts and active tools are separate.

## Actual result

The 2026-08-30 backend repair pass removed the previously reported old-schema audit and partial-week capacity failures from the 42-test affected backend run. The run then stopped with two errors in global proposal acceptance. During `_apply_proposal`, SQLite rejected insertion of a scheduler-managed `action_event_links` row because the newly staged referenced event had not been flushed first. The transaction rolled back, so atomic fail-closed behavior held, but accepting a valid proposal remains unusable. Format, lint, build, OpenAPI, governance, and diff checks did not run, and no rerun followed.

The approved continuation pass on 2026-08-30 passed all 58 focused frontend tests across 9 files. This includes blank new-tool sessions, the dedicated editor fields, scheduling schemas, AI Assistant flows, and proposal-first active-tool editing without an immediate metadata mutation. The isolated backend stage then stopped with 1 failure and 5 errors across 39 tests. Existing desktop database fixtures at revisions `20260715_0006` and `20260715_0007` failed before upgrade because the pre-upgrade integrity audit queried the current `ActionEventLinkRecord.managed_by` column against the older table. Backend completion, lint, build, OpenAPI, Office governance, and `git diff --check` therefore remain unverified. No rerun was performed.

Failed the single approved automated validation pass on 2026-08-30. Eight of nine focused frontend files passed and the run completed 57 of 58 tests. The schema, blank-editor anchoring, action scheduling, onboarding, prompt, settings-store, AI Assistant, and dedicated tool-editor cases passed. `Office/test/integration/goalPlanner.test.tsx:644` failed because it still queried the superseded accessible dialog name `Edit long-term plan and tool characteristics` after clicking `Edit plan & characteristics`; the current interface exposes the new tool editor contract instead. The command stopped immediately, so global-scheduling backend, stale/atomic proposal, SQLite migration, lint, build, OpenAPI, governance, and diff checks did not run. No rerun was performed.

MSW also reported unmatched scheduling proposal requests in existing AI Assistant and Goal Planner integration paths. Those cases did not fail on the warnings, but their mock coverage must be aligned before the next approved pass.

Latest evidence: the exact hook-boundary focused command passed 31/31 tests across the AI Assistant, Settings Panel, and Global Schedule Panel files on 2026-08-30 against working-tree@28245bb. The two scheduling settings cases explicitly enabled the server-reported `globalScheduling` capability without changing the shared default. Together with the earlier affected backend result of 43/43 and focused global-scheduling frontend result of 58/58, the observable review-first scheduling contract is passed. A following production build failed on separate TypeScript contract drift tracked as `ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007`; OpenAPI and final governance gates did not start.

Superseding continuation evidence: the five compiler-reported contract mismatches were repaired without changing runtime values. The same production build subsequently completed TypeScript compilation and transformed 524 modules, and the OpenAPI snapshot check passed. `ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007` is therefore verified; the earlier failed build remains preserved above as historical evidence.

Earlier evidence: the continuation gate started focused Vitest at 2026-08-30T00:56:35-07:00 against working-tree@28245bb. Vitest completed 9/9 files and 58/58 tests. The following 39-test backend command stopped with 1 failure plus 5 errors and established `ERR-DESKTOP-GLOBAL-SCHEDULING-MIGRATION-004` plus the partial-week capacity boundary.

Earlier evidence: focused Vitest command started at 2026-08-30T00:28:49-07:00 and stopped at 2026-08-30T00:29:38-07:00 against working-tree@28245bb. This is retained as historical failed evidence.

## Boundaries

Local SQLite does not prove MySQL concurrency or dialect behavior. Docker/MySQL, Server E2E, desktop packaging, and real provider calls are not part of this pass and must remain `NOT RUN` unless separately approved.

## Evidence invalidation — 2026-09-20

Covered implementation changed during the lifecycle repair. Earlier evidence is historical; this case is stale until its complete contract is reverified. New lifecycle-specific coverage is recorded in TC-CHAIN-LIFECYCLE-001-v1. Full-suite known baseline failures are documented in the repair report.
