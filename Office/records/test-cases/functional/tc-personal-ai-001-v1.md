---
test_case_version: 1
id: TC-PERSONAL-AI-001-v1
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
test_path: Office/test/backend/test_personal_ai_settings.py; Office/test/integration/personalAISettings.test.tsx; Office/test/unit/store/configStore.test.ts; Office/test/backend/test_mysql_contract.py; Office/test/e2e/serverAuth.test.ts
test_command: .venv-test/Scripts/python.exe -m unittest Office.test.backend.test_personal_ai_settings; npm.cmd exec -- vitest run Office/test/integration/personalAISettings.test.tsx Office/test/unit/store/configStore.test.ts; .venv-test/bin/python -m unittest discover Office/test/backend -p test_mysql_contract.py; npm run test:e2e:server
last_verified_at: 2026-09-21T01:33:39.573927+00:00
verified_against: covered-files-sha256:36cda16c9193a48ad43f82a5ca702d4a1a28766ef16dbf36e40482dba8f780f6
coverage_paths: backend/personal_ai.py; backend/server.py; backend/database.py; backend/calendar/migrations/versions/20260920_0012_personal_ai_settings.py; src/domain/schemas/personalAI.schema.ts; src/domain/schemas/auth.schema.ts; src/services/personalAIService.ts; src/store/personalAIStore.ts; src/store/configStore.ts; src/hooks/usePersonalAISettings.ts; src/components/settings/PersonalAISettings.tsx; src/components/settings/SettingsPanel.tsx; Office/test/backend/test_personal_ai_settings.py; Office/test/backend/test_mysql_contract.py; Office/test/integration/personalAISettings.test.tsx; Office/test/e2e/serverAuth.test.ts; scripts/e2e-launcher.mjs; requirements-server.lock; Office/test/unit/store/configStore.test.ts
contract_ids: personal-ai-account-isolation; write-only-secret; encrypted-at-rest; csrf-required; fixed-provider-endpoint; credential-export-exclusion; session-safe-settings; additive-ai-migration
---

# TC-PERSONAL-AI-001-v1 - Personal web AI configuration

## Purpose

Authenticated users manage their own provider key without exposing credentials through frontend builds, returned settings, preferences or exports. A saved key must be selected for that account's actual backend requests.

## Preconditions

Synthetic users and API keys only; isolated SQLite for local contract tests and an explicitly approved disposable MySQL database for native concurrency/browser verification. Provider requests are mocked, never real.

## Process

Save, reload, retry after failure, submit twice, switch accounts during a response, replace, retain with a blank field and confirm removal. Check anonymous/CSRF rejection, malformed inputs and unknown fields. Inspect ciphertext and user exports, restart the application, swap ciphertext between accounts, remove or change the encryption key. Mock chat and receipt calls and verify selected credentials/models. Upgrade from 0011 to 0012 and downgrade an empty fixture; preserve existing rows.

## Expected result

Only the authenticated account is affected. The key never appears in a read response, user export or browser persistence; database storage is encrypted. Missing/unreadable encryption state fails closed. Personal calls use the official DeepSeek endpoint. Loading and saving have visible feedback; failures preserve only the current form draft; old responses do not update another account. Removal uses operator service only if configured. Existing migration rows survive.

## Actual result

10 local backend tests passed in the full backend run and in a final dedicated run (12.314s); 4 new frontend interaction tests passed, with 8 focused tests passing after the final UI layering changes and an additional stale-response regression. Linux/MySQL 6/6 passed (including concurrent personal-key saves), and real Chromium server E2E 4/4 passed (including refresh, two accounts, mobile layout and deletion). Mobile screenshot inspected. No real AI calls or production test users.

## Evidence

Pre-fix two initial API tests failed with 404; after implementation they pass (level A). Remaining new coverage is derived post-fix evidence. Full frontend 369/369 passed. Full backend 177 ran: 170 passed, 5 MySQL tests skipped locally, and two unrelated goal-capacity cases failed. Those same two failures reproduce against the unchanged previous runtime archive. A sixth MySQL test was subsequently added and all six passed on the disposable server database. Detailed logs: ignored `test-results/personal-ai-20260920/` and `.scratch/personal-ai-*.log`; source tests above are the durable replay entrypoints.

## Confirmation

User requested a web API configuration entry. Per-account configuration was communicated as the default while awaiting optional preference feedback. Formal purpose/process/expected-result confirmation was not requested or inferred.

## Notes

Key saving does not make or charge for a provider request. Provider connectivity is not claimed. Existing capacity-date failures remain separately documented. Source fingerprint uses sorted relative paths, NUL separators and UTF-8 LF-normalized contents.

Current-state note (2026-09-21): AI planning output budget changed in covered shared backend paths. Prior evidence is retained; this complete historical suite was not rerun. Focused personal AI/auth tests and the complete frontend suite passed in the output-budget regression record.
