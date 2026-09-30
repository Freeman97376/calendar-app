---
test_case_version: 1
id: TC-AI-OUTPUT-001-v1
type: functional
spec_status: derived
execution_status: passed
version: 1
supersedes: none
superseded_by: none
purpose_status: draft
process_status: draft
expected_result_status: draft
confirmed_at: none
confirmed_by: none
source_kind: change-derived
source_ids: ERR-AI-OUTPUT-001
test_path: Office/test/backend/test_auth_api.py; Office/test/backend/test_personal_ai_settings.py; Office/test/unit/services/apiAIService.test.ts
test_command: .venv-test/Scripts/python.exe -m unittest Office.test.backend.test_auth_api Office.test.backend.test_personal_ai_settings; npm.cmd run test:run
last_verified_at: 2026-09-21T02:47:39.939700+00:00
verified_against: covered-files-sha256:cbb45ce085d170c01b8c3263e039dd2a322adf7bd2a347cb366011b1b487f4b7
coverage_paths: Office/test/backend/test_auth_api.py; Office/test/backend/test_personal_ai_settings.py; Office/test/unit/services/apiAIService.test.ts; backend/goal_control.py; backend/server.py; src/services/ai/apiAIService.ts
contract_ids: bounded-reasoning-planning; explicit-output-cap; no-automatic-paid-retry; account-model-selection; truncated-usage-accounting
---

# TC-AI-OUTPUT-001-v1 - Complete planning output within a bounded reasoning budget

## Purpose

Prevent the app's small non-reasoning output cap from cutting off reasoning model planning responses, while retaining bounded requests, accounting and explicit regeneration.

## Preconditions

Temporary SQLite server fixtures with synthetic accounts and provider credentials. HTTP provider calls are mocked; no production test accounts or paid AI requests.

## Process

Exercise all planning operations, the legacy planning alias, each usage mode and administrator clamping. Compare chat versus reasoning models, forged model overrides, huge and lower explicit output caps. Return truncated JSON and inspect the error and usage totals; submit again after the monthly hard limit. Exercise saved personal credentials and frontend request serialization.

## Expected result

Reasoning planning caps are 8192/16384/24576 tokens; normal planning remains 2000/3000/4000. Explicit lower totals remain respected. Planning reasoning reads allow 180 seconds, other calls 60. Backend model and administrator mode control the cap. Proxy planning clients omit the obsolete lower token request; direct-provider and routine callers keep explicit caps. Truncation returns a structured error without partial choices, records completion usage once and does not retry. Monthly limits still block later calls before the provider.

## Actual result

45 related backend tests passed; all 371 frontend tests passed. The new backend regression failed before the fix with 3000 versus 16384; the new frontend regression failed with an unwanted 1024 token cap. After the fix all pass (evidence A).

## Evidence

Commands above, Windows checkout, ignored logs `.scratch/ai-output-before-backend.log`, `.scratch/ai-output-before-frontend.log`, `.scratch/ai-output-backend.log`, `.scratch/ai-output-vitest.log`. Full backend: 180 tests, 172 passed, 6 conditional MySQL skips, two previously reproduced date-fixture failures documented in ERR-CAPACITY-DATE-FIXTURE-001. No assertions weakened. OpenAPI, lint, server build, Rust and version checks passed.

## Confirmation

Derived regression coverage for the user's reported failure during the authorized web AI configuration work; formal purpose/process/expected-result acceptance was not inferred.

## Notes

Mocked provider evidence establishes request budgeting and safe failure behavior. It does not guarantee an arbitrary future model response will fit or satisfy the plan schema. User regeneration remains explicit.
