---
test_case_version: 1
id: TC-TOOL-INPUT-001-v1
type: functional
spec_status: confirmed
execution_status: passed
version: 1
supersedes: none
superseded_by: none
purpose_status: confirmed
process_status: confirmed
expected_result_status: confirmed
confirmed_at: 2026-08-29T01:15:50-07:00
confirmed_by: user
source_kind: known-error
source_ids: ERR-TOOL-INPUT-001
test_path: Office/test/unit/domain/activeToolOnboarding.test.ts
test_command: npm.cmd run test:run -- Office/test/unit/domain/activeToolOnboarding.test.ts
last_verified_at: 2026-08-29T01:19:14-07:00
verified_against: working-tree@28245bb15972
coverage_paths: src/domain/logic/activeToolOnboarding.ts
contract_ids: fitness-safety-confirmation; user-input-classification
---

# TC-TOOL-INPUT-001-v1 - Fitness safety language is classified precisely

## Purpose

Prevent ordinary schedule wording from being treated as medical or injury confirmation while accepting explicit Chinese no-injury statements.

## Preconditions

Use the deterministic Fitness AI onboarding rules without an AI provider or database.

## Process

Submit `每周训练3次，每次45分钟，限制在晚上`, then submit `每周训练3次，没有已知伤病` as separate onboarding seeds.

## Expected result

The first input still requires the safety question. The second input counts as explicit safety confirmation and does not ask that question again.

## Actual result

Passed: all 9 cases in the focused Active Tool onboarding unit file passed, including both new Chinese safety-language inputs.

## Evidence

Command: `npm.cmd run test:run -- Office/test/unit/domain/activeToolOnboarding.test.ts Office/test/unit/store/configStore.test.ts Office/test/unit/store/uiStore.test.ts Office/test/unit/store/longTermMemoryStore.test.ts Office/test/integration/aiAssistant.test.tsx`. Environment: local Windows test runtime with no real provider or production database. Timestamp: 2026-08-29T01:19:14-07:00. Evidence level C: the deterministic post-fix regression file passed; no captured pre-fix failing execution exists.

## Confirmation

The user explicitly asked to add the proposed user-input cases while implementing the repair plan.

## Notes

This is a deterministic language guardrail, not medical advice.
