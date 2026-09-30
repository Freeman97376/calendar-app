---
test_case_version: 1
id: TC-SHARED-INVITE-001-v1
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
source_ids: none
test_path: Office/test/backend/test_invite_registration.py; Office/test/integration/authGate.test.tsx; Office/test/unit/store/authStore.test.ts
test_command: .venv-test/Scripts/python.exe -m unittest Office.test.backend.test_invite_registration; npm.cmd run test:run -- Office/test/integration/authGate.test.tsx Office/test/unit/store/authStore.test.ts
last_verified_at: 2026-09-20T18:11:31.579227+00:00
verified_against: covered-files-sha256:04b32a92efe57184d045ea47e620aacda615a09e9b1bff00e88f08b0584aaa4b
coverage_paths: backend/auth.py; backend/server.py; src/domain/schemas/auth.schema.ts; src/domain/logic/i18n.ts; src/services/appApiClient.ts; src/store/authStore.ts; src/hooks/useAuth.ts; src/hooks/useI18n.ts; src/components/auth/LoginPage.tsx; Office/test/backend/test_invite_registration.py; Office/test/integration/authGate.test.tsx; Office/test/unit/store/authStore.test.ts; Office/test/backend/test_mysql_contract.py; Office/test/e2e/serverAuth.test.ts; scripts/e2e-launcher.mjs
contract_ids: shared-nonexpiring-invite; server-only-registration; ordinary-user-only; auth-rate-isolation; atomic-user-creation
---

# TC-SHARED-INVITE-001-v1 - Shared invitation registration

## Purpose

Protect the user's requested shared, reusable, non-expiring invitation flow, user-created credentials, ordinary-user privilege boundary and server/desktop separation.

## Preconditions

Temporary SQLite databases and synthetic credentials only; isolated MSW/Vitest frontend. No provider calls or production access. Real MySQL and Server E2E are separate unexecuted release gates.

## Process

1. Register two users with one code, log in and verify isolated data.
2. Try missing configuration, desktop mode, wrong/rotated codes, duplicate/case-normalized usernames, malformed JSON, confusable identifiers, extra privilege fields and size limits.
3. Submit the same username concurrently, inject a mid-transaction failure, exhaust registration throttling and confirm login still works.
4. Submit the form, reject mismatched passwords locally, display bilingual invalid-code errors and countdowns, block double submits, return to login and erase secret fields. Prevent registration during reauthentication; preserve availability after logout.

## Expected result

The code can be reused indefinitely until changed or disabled. No code is returned by bootstrap or error responses. Registration always creates an ordinary user atomically, with private credentials hashed. A conflicting username creates only one account. Desktop and unconfigured servers reject registration. Registration does not replace a signed-in session or automatically sign in. Rate limits survive individual requests and do not consume login buckets.

## Actual result

10 backend tests and 13 authentication frontend tests passed. The frontend tests were rerun after the dependency-layer correction as part of a 48-test focused run, all passing. Desktop and mobile Chromium views verified with fully mocked API responses; 390px view has no horizontal overflow and the Chinese success flow completes without page errors.

## Evidence

Verified 2026-09-20T16:51:49.384485+00:00; covered-files-sha256:013dbd9676626235921344b685f4882897d957fdd9cbbb50495cee7335f5ff5a. The backend tests initially failed before implementation (10 tests, 20 failures including subtests), then passed. Frontend coverage is change-derived. See [implementation report](../../shared-invite-registration-20260920.md). MySQL concurrent registration and the server browser journey have been added, but not executed.

## Confirmation

The user explicitly requested one shared, long-lived code and use of the formal Mantle server operations skill. Detailed test process and expected results have not been separately confirmed; this remains derived coverage, not a confirmed acceptance baseline.

## Notes

Deterministic malformed-input cases are embedded in the backend test: 10 bounded mutations plus malformed JSON, no random corpus or real service calls. Fingerprint is SHA-256 over sorted project-relative path + NUL + UTF-8 LF-normalized file content + NUL for the listed coverage paths.

## Subpath revalidation — 2026-09-20

The API base changed for the confirmed `/calendar/` deployment. All 10 backend invitation tests and all 13 frontend authentication tests passed again (frontend included in a 92-test service/auth/config run). Reverified 2026-09-20T17:35:45.161911+00:00; covered-files-sha256:373396df05a2dfc5267efa638caf561dbdfa4c3302cf3a74acdeb517d13a6b9f. MySQL concurrency and Server E2E remain unrun pending explicit disposable-environment approval; this is local evidence only.

## Linux release revalidation — 2026-09-20

Reverified 2026-09-20T18:11:31.579227+00:00; covered-files-sha256:04b32a92efe57184d045ea47e620aacda615a09e9b1bff00e88f08b0584aaa4b. Complete frontend 365/365 and local backend 162 passed, with 5 MySQL tests skipped locally and passed separately on the authorized Linux test database. Three server browser tests passed. Date fixtures now remain valid relative to the test date; fixed-date timezone cases and business assertions were retained. Additional concurrency/cleanup evidence is recorded in TC-SERVER-RELEASE-001-v1. Earlier unrun-gate and full-suite-failure statements above are historical and superseded by this run.

2026-09-20 personal AI update: covered files changed; prior narrow fingerprint remains historical. New feature/whole-suite evidence is recorded in TC-PERSONAL-AI-001-v1. This record is not promoted solely by an overlapping suite run.
