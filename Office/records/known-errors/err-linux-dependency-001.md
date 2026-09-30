---
known_error_version: 1
id: ERR-LINUX-DEPENDENCY-001
status: fixed_unverified
severity: high
reported_at: 2026-09-20
resolved_at: 2026-09-20
root_cause_status: confirmed
regression_test_case: TC-SERVER-RELEASE-001-v1
regression_test_path: Office/test/backend/test_mysql_contract.py; Office/test/e2e/serverAuth.test.ts
regression_test_command: uv pip install --python .venv-test/bin/python --require-hashes -r requirements-server.lock; .venv-test/bin/python -m unittest Office.test.backend.test_mysql_contract; node scripts/run-playwright.mjs server
last_verified_at: 2026-09-20T18:11:31.579227+00:00
verified_against: covered-files-sha256:30746326b03a4a576a2f084fefb4d5405ef1b6866521c4c8e36f14821ebc4dfb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-LINUX-DEPENDENCY-001 - Strict Linux installation rejected the Windows-derived lock

## Symptom

Calendar server cannot install its backend dependencies on Ubuntu using the required hash-locked procedure.

## Trigger

Run `uv pip install --python .venv-test/bin/python --require-hashes -r requirements-server.lock` on Linux/Python 3.14 using the pre-fix lock.

## Evidence

Reproduced: `In --require-hashes mode, all requirements must be pinned upfront with ==, but found: secretstorage`.

## Expected behavior

The server dependency lock includes platform-specific transitive requirements and installs on the target platform without weakening hashes.

## Root cause

Confirmed: the prior lock was compiled on Windows. Linux keyring dependencies were absent, as was uvicorn's Linux uvloop dependency.

## Resolution

Used uv universal resolution with the old lock as constraints. Every existing pinned version is unchanged; added conditional cryptography, jeepney, secretstorage and uvloop with hashes. Target Linux installations now pass.

## Verification

[TC-SERVER-RELEASE-001-v1](../test-cases/functional/tc-server-release-001-v1.md), exact automated install and native MySQL/browser commands above. Both fresh validation and production environments installed successfully; 5 MySQL and 3 browser tests passed. covered-files-sha256:30746326b03a4a576a2f084fefb4d5405ef1b6866521c4c8e36f14821ebc4dfb; 2026-09-20T18:11:31.579227+00:00. Evidence level A.

## Manual verification

Not applicable.

## Notes

The lock correction does not add a database migration or change runtime account policy.

2026-09-20: historical verification retained; linked coverage fingerprint is stale after personal AI configuration changes. See TC-PERSONAL-AI-001-v1 for current feature and full-suite evidence.
