---
known_error_version: 1
id: ERR-GLOBAL-SCHEDULING-FRONTEND-BOUNDARY-006
status: fixed_unverified
severity: medium
reported_at: 2026-08-30T02:09:17.6081435-07:00
resolved_at: 2026-08-30
root_cause_status: confirmed
regression_test_case: TC-GLOBAL-SCHEDULING-001-v1
regression_test_path: Office/test/integration/aiAssistant.test.tsx; Office/test/integration/settingsPanel.test.tsx; Office/test/integration/globalSchedulePanel.test.tsx; src/components/ai/AIAssistantPanel.tsx; src/components/settings/SchedulingSettings.tsx; src/components/tools/GlobalSchedulePanel.tsx; src/store/aiStore.ts
regression_test_command: npm.cmd run lint; npm.cmd run test:run -- Office/test/integration/aiAssistant.test.tsx Office/test/integration/settingsPanel.test.tsx Office/test/integration/globalSchedulePanel.test.tsx
last_verified_at: 2026-08-30T20:26:56.3579855-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-GLOBAL-SCHEDULING-FRONTEND-BOUNDARY-006 - Global scheduling UI bypasses the hook boundary

## Symptom

The repository lint gate fails with eight errors after the global scheduling implementation. Three React components import stores or domain schema/logic directly, and `aiStore.ts` retains one unused store import. The lint run also reports one missing effect dependency warning in the AI Assistant.

## Trigger

Run `npm.cmd run lint` against working-tree@28245bb with the global scheduling UI present.

## Evidence

The approved repository-gate continuation passed formatting and then stopped at lint. `AIAssistantPanel.tsx` has three restricted imports, `SchedulingSettings.tsx` has three, `GlobalSchedulePanel.tsx` has one, and `aiStore.ts` has one unused import. The AI Assistant effect also warns that the aggregate `ai` value is missing from its dependency list.

## Expected behavior

Components obtain state, actions, and derived business data through hooks; hooks may coordinate stores and domain rules. The lint command completes without restricted-path errors, unused imports, or effect dependency warnings.

## Root cause

Confirmed. The new UI was wired directly to Zustand stores and a domain schema/derivation instead of adding hook-level facades. This violates the repository's enforced component dependency boundary. The unused `useUIStore` import is residual code, and the effect references the aggregate `ai` object while listing selected members only.

## Resolution

Implemented. Added hook facades for AI tool context, scheduling settings, and global proposal state. The three components now consume hook view models, the unused store import is removed, and stale tool selection is validated only after the memory overview has loaded successfully. ESLint configuration and public contracts are unchanged.

## Verification

Verified at evidence level A against working-tree@28245bb. The pre-fix lint gate reproduced eight errors and one effect warning; the post-fix lint gate passed. After limiting `globalScheduling: true` to the two scheduling-settings cases, the exact linked focused command passed 31/31 tests across all three files. This verifies the component-to-hook boundary and the affected UI orchestration. The later repository build failed on separate TypeScript contract drift tracked as `ERR-GLOBAL-SCHEDULING-TYPE-BUILD-007`.

## Manual verification

Not applicable. No waiver has been requested or approved.

## Notes

The focused frontend and backend behavior regressions remain passed. React emitted non-failing `act(...)` test warnings in one AI Assistant case; no silent write or assertion failure was observed. Repository build readiness is tracked separately and is not implied by this verification.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
