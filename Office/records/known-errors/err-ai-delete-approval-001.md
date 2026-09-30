---
known_error_version: 1
id: ERR-AI-DELETE-APPROVAL-001
status: fixed_unverified
severity: medium
reported_at: 2026-08-29T02:19:36-07:00
resolved_at: none
root_cause_status: confirmed
regression_test_case: TC-AI-DELETE-APPROVAL-001-v1
regression_test_path: Office/test/unit/services/apiAIService.test.ts; Office/test/integration/aiAssistant.test.tsx
regression_test_command: npm.cmd run test:run -- Office/test/unit/services/apiAIService.test.ts Office/test/integration/aiAssistant.test.tsx
last_verified_at: none
verified_against: none
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-AI-DELETE-APPROVAL-001 - Chat deletion returned no approval plan

## Symptom

Entering a deletion request in normal AI chat did not produce an approval plan and did not delete the target item.

## Trigger

Use Chat mode with calendar context enabled and ask the assistant to delete an existing event, such as `Delete Canceled lunch.` or the equivalent Chinese request.

## Evidence

The user confirmed the symptom during manual testing. Code inspection confirmed that the normal Chat path used `continueConversation`, whose documented JSON example contained only `create_event` even though the runtime schema supported delete actions.

## Expected behavior

A uniquely matched delete request produces a reviewable `delete_event` or `delete_todo` action using the exact supplied context id. Nothing is deleted before approval. Missing or ambiguous matches produce a clarification question.

## Root cause

Confirmed: the conversation prompt described mutation support in prose but its structured-output example omitted update, delete, todo, and scheduling action shapes. The provider could therefore return a text-only reply with no `actionPlan`.

## Resolution

The conversation JSON contract now reuses the complete calendar action shape and explicitly requires exact-id delete plans for unique matches, clarification for ambiguous matches, and no claim of completion before approval.

## Verification

The Chat UI regression passed in the one focused run, confirming approval and post-approval deletion behavior. The model-contract unit reached the correct prompt and context but failed an incorrect test assertion (`eventId` versus context `id`); the assertion was corrected and not rerun. The error therefore remains fixed but unverified.

## Manual verification

Not applicable.

## Notes

The pre-fix behavior failed closed: no unapproved or unintended deletion was observed.
