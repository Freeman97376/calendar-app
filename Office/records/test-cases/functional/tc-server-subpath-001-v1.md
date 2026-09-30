---
test_case_version: 1
id: TC-SERVER-SUBPATH-001-v1
type: functional
spec_status: derived
execution_status: passed
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
test_path: Office/test/unit/services/appApiClient.test.ts
test_command: npm.cmd run test:run -- Office/test/unit/services/appApiClient.test.ts; npm.cmd run build:server; npm.cmd run build
last_verified_at: 2026-09-20T17:35:45.161911+00:00
verified_against: covered-files-sha256:e9dcab10f1137b039d412284e34a376824735624ac2d9bd2cefbe7b845781711
coverage_paths: src/services/appApiClient.ts; Office/test/unit/services/appApiClient.test.ts; package.json; eslint.config.js; .prettierignore; .gitignore
contract_ids: server-subpath-routing; root-and-desktop-routing-compatibility
---

# TC-SERVER-SUBPATH-001-v1 - Calendar deployment base path

## Purpose

Protect the confirmed `/calendar/` deployment path across resources and API requests while preserving root builds, explicit API overrides and the desktop runtime's loopback address.

## Preconditions

Local Vitest and Vite builds only. Browser smoke uses synthetic, intercepted API responses. No production registration or provider calls. Nginx and real MySQL runtime behavior are separate release gates.

## Process

1. Load the API client with root and `/calendar/` build bases, blank overrides and explicit/legacy overrides.
2. Check bootstrap, registration, calendar, memory, fridge, AI and backup URL families; send a synthetic registration and verify credentials remain included.
3. Apply a desktop runtime address after initialization and verify it replaces the web base.
4. Build both default and server targets. Open the server artifact at `/calendar/` with mocked bootstrap/register responses; complete registration on a 390px viewport and inspect resource/API paths and page errors.

## Expected result

Same-origin server resources and APIs stay under `/calendar/`. Blank overrides do not erase that base. Explicit API and desktop addresses keep precedence. Registration returns to sign-in with cleared password fields; no root `/api` requests, page errors or horizontal overflow in the mocked browser journey.

## Actual result

API client suite passed 12/12 (including five added path tests); final relevant frontend run passed 92/92. Default and server builds passed. Chromium production-artifact smoke requested only `/calendar/` resources and APIs; synthetic registration completed with zero page errors or mobile overflow. Lint passed after excluding the generated `dist-server` directory, consistent with existing build output exclusions.

## Evidence

2026-09-20T17:35:45.161911+00:00; covered-files-sha256:e9dcab10f1137b039d412284e34a376824735624ac2d9bd2cefbe7b845781711. Before the fix, the expanded API client suite had 9 passes and 3 failures: path requests used root `/api`, and a blank current override suppressed the legacy override. All 12 passed after the fix (level A). The browser smoke was executed via a temporary Node HTTP server and Playwright; it is supplementary evidence, not the formal server E2E suite. See [server preparation report](../../calendar-subpath-ssh-20260920.md).

## Confirmation

The user explicitly confirmed the deployment URL. The detailed test purpose, process and expected outcome were not separately confirmed; this case remains derived.

## Notes

No live service started and no production database written. Fingerprint hashes sorted relative paths, NUL, UTF-8 LF-normalized content, NUL. Existing full-suite failures remain separately documented.
