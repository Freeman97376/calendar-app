---
test_case_version: 1
id: TC-SERVER-RELEASE-001-v1
type: functional
spec_status: derived
execution_status: stale
version: 1
supersedes: none
superseded_by: none
purpose_status: draft
process_status: draft
expected_result_status: draft
confirmed_at: none
confirmed_by: none
source_kind: change-derived
source_ids: ERR-LINUX-DEPENDENCY-001
test_path: Office/test/backend/test_mysql_contract.py; Office/test/e2e/serverAuth.test.ts
test_command: uv pip install --python .venv-test/bin/python --require-hashes -r requirements-server.lock; .venv-test/bin/python -m unittest Office.test.backend.test_mysql_contract; node scripts/run-playwright.mjs server
last_verified_at: 2026-09-20T18:11:31.579227+00:00
verified_against: covered-files-sha256:30746326b03a4a576a2f084fefb4d5405ef1b6866521c4c8e36f14821ebc4dfb
coverage_paths: requirements.in; requirements-server.lock; Office/test/backend/test_mysql_contract.py; Office/test/e2e/serverAuth.test.ts; scripts/e2e-launcher.mjs; deploy/calendar-app.service; deploy/nginx-calendar-path.conf
contract_ids: linux-hash-locked-install; mysql-concurrent-review; invite-server-registration; server-account-isolation
---

# TC-SERVER-RELEASE-001-v1 - Linux server release validation

## Purpose

Prove the exact Python dependency set installs on Linux with hash enforcement, and invitation/authentication plus concurrent scheduling and AI review preserve isolation and atomicity on real MySQL.

## Preconditions

User explicitly approved a dedicated disposable MySQL database and synthetic users. Ubuntu 22.04, independent Python 3.14, MySQL 8 and Node 22. No real AI calls or production test accounts. URL credentials are supplied through a private environment, never command output.

## Process

1. Install locked dependencies with required hashes in an isolated environment; migrate a fresh test database to head.
2. Run native MySQL contract tests covering concurrent duplicate registration, tenant isolation, activation rollback, concurrent AI apply/copy retries and rollback, and scheduling pause/resume/completion plus accept/reject/recompute concurrency.
3. Run server Playwright tests with synthetic accounts/code: CSRF writes, expiry, draft retention, reauthentication, logout, account isolation, invalid code, reused code and ordinary-user role.
4. Remove the exact test database, SQL user, temporary source/runtime directory and temporary credentials; verify production registered-user count remains zero (exclude migration-internal local record).

## Expected result

No unpinned transitive dependencies, no hash bypass, one committed result per operation, no partial writes, no cross-user visibility. All browser journeys pass under the original assertions and time limits. Test resources are removed and production user data is untouched.

## Actual result

Passed Linux hash installation in both validation and production environments, preserving every pre-existing dependency version and adding four conditional dependencies. Five MySQL tests passed in 1.728s; three server browser tests passed in 9.7s. Disposable resources removed. Local complete runs passed 365 frontend and 162 backend tests; five MySQL cases are skipped only in the local suite and passed separately on Linux.

## Evidence

2026-09-20T18:11:31.579227+00:00; covered-files-sha256:30746326b03a4a576a2f084fefb4d5405ef1b6866521c4c8e36f14821ebc4dfb. The initial lock failed with an unpinned secretstorage dependency (level A). The first browser run over a Windows-to-server MySQL tunnel exceeded the default login UI wait; running browser/backend/database together on Linux passed without longer timeouts. Linux Chromium initially lacked system libraries; installing the missing libraries with no package upgrades or service restarts resolved launch. Exact logs are in ignored `test-results/deployment-20260920/` and [deployment record](../../calendar-live-deployment-20260920.md).

## Confirmation

Disposable environment execution was explicitly authorized. Detailed case specification remains derived; authorization was not treated as confirmation of every test expectation.

## Notes

No waiver. Public browser checks are read-only and do not create production users. AI remains unconfigured. Six development-tool dependency advisories are recorded separately and excluded from the production runtime archive.

2026-09-20 personal AI update: covered files changed; prior narrow fingerprint remains historical. New feature/whole-suite evidence is recorded in TC-PERSONAL-AI-001-v1. This record is not promoted solely by an overlapping suite run.
