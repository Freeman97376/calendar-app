---
test_case_version: 1
id: TC-AI-HISTORY-001-v1
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
source_ids: ERR-AI-HISTORY-001
test_path: Office/test/backend/test_auth_api.py
test_command: node scripts/run-python.mjs -m unittest Office.test.backend.test_auth_api.AuthApiTests.test_ai_conversation_history_is_reloadable_and_tenant_scoped
last_verified_at: none
verified_against: none
coverage_paths: backend/goal_control.py; backend/goal_control_api.py; src/services/goalControlClient.ts; src/store/aiStore.ts
contract_ids: ai-conversation-history; tenant-isolation
---

# TC-AI-HISTORY-001-v1 - AI conversation history reload and isolation

## Purpose

Ensure users do not lose their latest assistant conversation on reload and never see another account's messages.

## Preconditions

Use a temporary migrated SQLite server database with two synthetic accounts and no provider request.

## Process

Create an assistant conversation as the first account, append user and assistant messages, reload the thread, then list and fetch it as the second account.

## Expected result

The first account reloads the messages in order. The second account lists no such thread and receives not-found when requesting its ID.

## Actual result

Not run.

## Evidence

Implementation and executable regression case added against revision `28245bb`; no execution evidence recorded yet.

## Confirmation

The user explicitly requested the architecture repair plan and the accompanying user-facing tests.

## Notes

Message content in this test is synthetic and contains no private user data.
