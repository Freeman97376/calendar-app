---
known_error_version: 1
id: ERR-AI-OUTPUT-001
status: verified
severity: medium
reported_at: 2026-09-21T02:29:28Z
resolved_at: 2026-09-21T02:47:39.939700+00:00
root_cause_status: confirmed
regression_test_case: TC-AI-OUTPUT-001-v1
regression_test_path: Office/test/backend/test_auth_api.py; Office/test/unit/services/apiAIService.test.ts
regression_test_command: .venv-test/Scripts/python.exe -m unittest Office.test.backend.test_auth_api Office.test.backend.test_personal_ai_settings; npm.cmd run test:run
last_verified_at: 2026-09-21T02:47:39.939700+00:00
verified_against: covered-files-sha256:cbb45ce085d170c01b8c3263e039dd2a322adf7bd2a347cb366011b1b487f4b7
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-AI-OUTPUT-001 - Reasoning plan exhausted a non-reasoning output budget

## Symptom

The website rejected an incomplete JSON planning response with `ai_output_truncated`.

## Trigger

A personal-key goal planning request selected `deepseek-reasoner` under Balanced mode.

## Evidence

Read-only live usage metadata recorded operation goal_plan, model deepseek-reasoner, balanced mode, 1925 input tokens, 3000 output tokens and output_truncated. No prompt, response content or provider credential was read. Synthetic tests independently reproduced the 3000-token backend cap and a second 1024-token frontend cap.

## Expected behavior

Choose a bounded output budget appropriate to reasoning plus final JSON, preserve administrator limits and account selection, and require explicit regeneration on incomplete output.

## Root cause

Confirmed: planning used the same 3000-token cap for both chat and reasoning models. Other planning clients additionally supplied short fixed caps. Provider authentication succeeded in the failed request.

## Resolution

MODE_LIMITS now includes reasoningOutput for planning; the backend selects it for deepseek-reasoner and allows 180-second reads. Backend-routed planning clients use the server default. Normal caps, explicit lower totals, rate limits and monthly accounting are retained.

## Verification

TC-AI-OUTPUT-001-v1, command and fingerprint above, evidence level A. 45 related backend and 371 frontend tests passed. Full suite date-fixture failures remain separately tracked. No real AI regeneration was performed.

## Manual verification

Not applicable.

## Notes

Verification covers the confirmed budget mismatch and no-retry/accounting behavior, not guaranteed success for all future AI outputs.
