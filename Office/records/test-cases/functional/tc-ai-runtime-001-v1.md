---
test_case_version: 1
id: TC-AI-RUNTIME-001-v1
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
source_ids: ERR-AI-RUNTIME-001
test_path: Office/test/backend/test_auth_api.py; Office/test/unit/store/configStore.test.ts
test_command: npm.cmd run test:run -- Office/test/unit/store/configStore.test.ts; node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_bootstrap_reports_backend_ai_truth_and_atomic_capabilities
last_verified_at: none
verified_against: none
coverage_paths: backend/server.py; src/domain/schemas/auth.schema.ts; src/store/configStore.ts; src/components/ai/AIAssistantPanel.tsx
contract_ids: backend-managed-ai; secret-boundary
---

# TC-AI-RUNTIME-001-v1 - Backend AI runtime truth is authoritative

## Purpose

Ensure the UI accurately reports the provider, effective models, key availability, editability, and lack of automatic fallback without suggesting that browser settings can bypass the backend architecture.

## Preconditions

Use the isolated bootstrap endpoint and mocked frontend transport. Do not expose or use a real provider key.

## Process

Read bootstrap in server mode with no provider key. Initialize the frontend with a conflicting legacy local-provider preference. Load and update backend configuration status.

## Expected result

Bootstrap reports backend-managed, non-editable DeepSeek-compatible AI and capability flags. It truthfully reports that automatic rule fallback is unavailable. The frontend continues to call the Calendar API, displays the backend model/key state, and ignores the legacy local-provider request for execution.

## Actual result

Partially run. The frontend runtime configuration unit passed. The backend bootstrap case and the revised read-only AI-panel integration case were not run after the focused command stopped.

## Evidence

The focused frontend command passed `Office/test/unit/store/configStore.test.ts` at 2026-08-29T01:19:14-07:00. The old local-provider integration expectation failed, was identified as conflicting with the confirmed backend-managed contract, and was replaced without a rerun. Backend validation did not start.

## Confirmation

The user explicitly requested precise architecture verification, repair planning, and the proposed user-input tests.

## Notes

This validates contract truth, not a paid provider request.
