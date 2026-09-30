---
known_error_version: 1
id: ERR-AI-RUNTIME-001
status: fixed_unverified
severity: medium
reported_at: 2026-08-29T01:15:50-07:00
resolved_at: none
root_cause_status: confirmed
regression_test_case: TC-AI-RUNTIME-001-v1
regression_test_path: Office/test/backend/test_auth_api.py; Office/test/unit/store/configStore.test.ts
regression_test_command: npm.cmd run test:run -- Office/test/unit/store/configStore.test.ts; node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_bootstrap_reports_backend_ai_truth_and_atomic_capabilities
last_verified_at: none
verified_against: none
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-AI-RUNTIME-001 - UI could imply a browser-selectable AI architecture

## Symptom

Provider and model controls implied that users could switch between local and API execution even though production requests are backend-managed.

## Trigger

Open AI chat settings or load legacy browser preferences.

## Evidence

Confirmed by code inspection of editable provider/model controls and legacy runtime preference application.

## Expected behavior

The backend reports the effective provider, models, key state, and whether automatic fallback really exists; the browser shows these values as read-only runtime truth.

## Root cause

Runtime preference fields were reused as execution authority after the backend proxy became mandatory.

## Resolution

Added bootstrap AI runtime metadata, forced Calendar API transport, replaced AI panel provider/model editing with backend status, and marked automatic rule fallback unavailable because no such failover path exists.

## Verification

Linked regression cases exist but have not been run.

## Manual verification

Not applicable.

## Notes

Desktop administrators can still configure the backend key through the backend settings endpoint.
