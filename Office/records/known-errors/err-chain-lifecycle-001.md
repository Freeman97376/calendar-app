---
known_error_version: 1
id: ERR-CHAIN-LIFECYCLE-001
status: fixed_unverified
severity: high
reported_at: 2026-09-20
resolved_at: 2026-09-20
root_cause_status: confirmed
regression_test_case: TC-CHAIN-LIFECYCLE-001-v1
regression_test_path: Office/test/backend/test_chain_lifecycle.py
regression_test_command: node scripts/run-python.mjs -m unittest discover Office/test/backend -p test_chain_lifecycle.py
last_verified_at: 2026-09-20T16:51:49.384485+00:00
verified_against: covered-files-sha256:2ebe0c53cec3a455b3f6b04fc6cbf8bd59391abc8ebd1d06404ea16e6b35fad7
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-CHAIN-LIFECYCLE-001 - Tool recovery, lost drafts, and repeated AI execution

## Symptom

Paused tools cannot resume; recompute drops a pending tool edit; previously executed AI plans reload as pending and create duplicate tasks on another approval.

## Trigger

Pause and accept then resume a tool. Recompute while a tool edit is pending. Execute an AI create-task plan, reload conversation history, and approve again.

## Evidence

Isolated pre-fix probes reproduced all three bugs. Executable regression tests initially reported 2 failures and 4 errors; the completed lifecycle suite now passes 11/11 tests. No production data was used.

## Expected behavior

Resume succeeds through review, drafts persist until resolved, and each saved AI operation commits once across reload and retry.

## Root cause

Confirmed: active-only project queries excluded paused tools; draft carry-forward was limited to setup-required proposals; AI execution state lived only in frontend memory with a fresh approval key on each drawer opening.

## Resolution

Use all instantiated tools in snapshots and active-only scheduling; preserve patches with conflict/version checks and serialized transactions. Store server-owned AI review state in conversation JSON, derive operation keys from the saved reference, and commit review state with the business batch. Upgrade frontend snapshots, persistence retries, and session guards.

## Verification

[Confirmed case](../test-cases/functional/tc-chain-lifecycle-001-v1.md). Command: `node scripts/run-python.mjs -m unittest discover Office/test/backend -p test_chain_lifecycle.py`; 11/11 passed at 2026-09-20T08:10:16.853059+00:00; covered-files-sha256:24a910a78a2394c7771c8238d272bf99acdfb5c2ef011cac220f200af05ce604. See the case for 35 frontend and 2 HTTP checks. Core evidence level A.

## Manual verification

Not applicable.

## Notes

Full-suite baseline failures and unrun MySQL/Server E2E remain separately documented; they are not waived by this verification.

## Reverification after shared invitation change

2026-09-20T16:51:49.384485+00:00: the complete backend run passed the 11 lifecycle tests and 2 HTTP approval cases; the final focused frontend run passed all 35 lifecycle checks. Current covered state: covered-files-sha256:2ebe0c53cec3a455b3f6b04fc6cbf8bd59391abc8ebd1d06404ea16e6b35fad7. Existing unrelated full-suite failures remain listed separately.

2026-09-20: historical verification retained; linked coverage fingerprint is stale after personal AI configuration changes. See TC-PERSONAL-AI-001-v1 for current feature and full-suite evidence.
