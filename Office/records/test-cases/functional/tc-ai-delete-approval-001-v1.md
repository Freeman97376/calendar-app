---
test_case_version: 1
id: TC-AI-DELETE-APPROVAL-001-v1
type: functional
spec_status: derived
execution_status: not_run
version: 1
supersedes: none
superseded_by: none
purpose_status: draft
process_status: draft
expected_result_status: draft
confirmed_at: none
confirmed_by: none
source_kind: known-error
source_ids: ERR-AI-DELETE-APPROVAL-001
test_path: Office/test/unit/services/apiAIService.test.ts; Office/test/integration/aiAssistant.test.tsx
test_command: npm.cmd run test:run -- Office/test/unit/services/apiAIService.test.ts Office/test/integration/aiAssistant.test.tsx
last_verified_at: none
verified_against: none
coverage_paths: src/services/ai/apiAIService.ts; src/store/aiStore.ts; src/components/ai/AIAssistantPanel.tsx; src/hooks/useAI.ts
contract_ids: ai-delete-intent; approval-required; exact-context-id
---

# TC-AI-DELETE-APPROVAL-001-v1 - Chat deletion requires review before mutation

## Purpose

Protect the user-visible contract that a deletion request in normal AI chat becomes an exact, reviewable calendar action rather than a text-only response or an unapproved mutation.

## Preconditions

Use isolated Vitest state with a synthetic event and mocked AI/backend responses. Do not call a real provider or use production data.

## Process

Create one synthetic event named `Canceled lunch`. Submit `Delete Canceled lunch.` in Chat mode with calendar context enabled. Confirm that the AI request documents `delete_event`, includes the exact event id, and returns a pending deletion plan. Open review, confirm the event still exists, apply the plan, and then inspect the event store.

## Expected result

Exactly one matching event produces a `delete_event` plan with the supplied context id. The event remains unchanged before approval and is deleted only after the user applies the reviewed plan. A missing or ambiguous target asks for clarification instead of guessing.

## Actual result

Partially run. The Chat UI integration regression passed, including approval visibility, no pre-approval deletion, and deletion after apply. The model-contract unit returned the correct delete schema and exact context event id, but its test assertion expected the context field name `eventId` instead of the real `id`; that assertion was corrected afterward and was not rerun.

## Evidence

User reported the pre-fix symptom during manual testing on 2026-08-29. The one focused command `npm.cmd run test:run -- Office/test/unit/services/apiAIService.test.ts Office/test/integration/aiAssistant.test.tsx` ran at 2026-08-29T02:20:34-07:00: 39 tests passed and one newly added assertion failed because it used the wrong context field name. The assertion was corrected without another test run, per user instruction.

## Confirmation

The user's report confirms the observed symptom. Purpose, repeatable process, and full expected-result contract remain derived pending explicit acceptance confirmation.

## Notes

This case covers both the model-facing structured-output contract and the Chat UI approval boundary without a real provider call.
