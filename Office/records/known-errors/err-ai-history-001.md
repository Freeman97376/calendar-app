---
known_error_version: 1
id: ERR-AI-HISTORY-001
status: fixed_unverified
severity: medium
reported_at: 2026-08-29T01:15:50-07:00
resolved_at: none
root_cause_status: confirmed
regression_test_case: TC-AI-HISTORY-001-v1
regression_test_path: Office/test/backend/test_auth_api.py
regression_test_command: node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_ai_conversation_history_is_reloadable_and_tenant_scoped
last_verified_at: none
verified_against: none
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-AI-HISTORY-001 - AI chat history disappeared on reload

## Symptom

General AI assistant messages lived only in the browser store and were lost on reload.

## Trigger

Exchange messages in the AI panel and reload or restore the authenticated session.

## Evidence

Confirmed by code inspection: the AI store had no persistence client or reload path.

## Expected behavior

The latest conversation reloads for the same tenant and is inaccessible to all other tenants.

## Root cause

Existing conversation tables were used only by goal-planning flows, not general assistant chat.

## Resolution

Added assistant-chat endpoints, frontend persistence, session restore, archive-on-clear, and tenant-isolation coverage.

## Verification

Linked regression case exists but has not been run.

## Manual verification

Not applicable.

## Notes

The UI currently restores the latest active conversation; a full history picker is a later usability enhancement.
