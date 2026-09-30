---
known_error_version: 1
id: ERR-TOOL-INPUT-001
status: verified
severity: high
reported_at: 2026-08-29T01:15:50-07:00
resolved_at: 2026-08-29T01:19:14-07:00
root_cause_status: confirmed
regression_test_case: TC-TOOL-INPUT-001-v1
regression_test_path: Office/test/unit/domain/activeToolOnboarding.test.ts
regression_test_command: npm.cmd run test:run -- Office/test/unit/domain/activeToolOnboarding.test.ts
last_verified_at: 2026-08-29T01:19:14-07:00
verified_against: working-tree@28245bb15972
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-TOOL-INPUT-001 - Ordinary constraint text could bypass fitness safety confirmation

## Symptom

The Chinese word `限制` in a scheduling statement could be treated as sufficient fitness safety information.

## Trigger

Enter `每周训练3次，每次45分钟，限制在晚上` during Fitness AI onboarding.

## Evidence

Confirmed by code inspection of the broad safety keyword matcher.

## Expected behavior

Only explicit injury, pain, medical, physical-limitation, or no-known-injury wording confirms the safety question.

## Root cause

The matcher treated a generic constraint keyword as a safety fact without medical or physical context.

## Resolution

Replaced the broad keyword check with explicit safety-language classification and added Chinese positive and negative cases.

## Verification

`TC-TOOL-INPUT-001-v1` passed in `Office/test/unit/domain/activeToolOnboarding.test.ts` as part of the single focused Vitest command at 2026-08-29T01:19:14-07:00. Evidence level C.

## Manual verification

Not applicable.

## Notes

The guardrail does not diagnose health conditions.
