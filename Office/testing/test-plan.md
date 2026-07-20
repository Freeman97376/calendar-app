# 🧪 Test Plan — Calendar App

> Maintained by: Claude Code / Codex | Last updated: 2026-07-15
> All tests in `tests/` are written and maintained by the Supervisor (Claude Code).

---

## Testing Stack

| Tool                            | Role                                                 |
| ------------------------------- | ---------------------------------------------------- |
| **Vitest**                      | Test runner (replaces Jest, native Vite integration) |
| **React Testing Library**       | Component + hook tests (user-centric queries)        |
| **@testing-library/user-event** | Simulates real user interactions (type, click, drag) |
| **MSW (Mock Service Worker)**   | Mocks backend and AI network calls in tests          |
| **@testing-library/jest-dom**   | DOM assertion matchers (`toBeInTheDocument`, etc.)   |
| **Playwright**                  | E2E tests against the running dev server (Phase 7)   |

---

## Coverage Targets by Layer

| Layer               | Test Type           | Target    | Rationale                                                |
| ------------------- | ------------------- | --------- | -------------------------------------------------------- |
| `domain/logic/`     | Unit                | **100%**  | Pure functions — no excuses                              |
| `domain/schemas/`   | Unit (Zod parse)    | **100%**  | Every schema has valid + invalid test cases              |
| `store/`            | Unit                | **90%+**  | Actions, selectors, edge cases                           |
| `services/storage/` | Unit + Integration  | **85%+**  | API adapter contracts plus isolated legacy-adapter tests |
| `services/ai/`      | Unit (MSW)          | **85%+**  | Mock API responses; verify Zod validation                |
| `hooks/`            | Integration (RTL)   | **80%+**  | Hook behaviour with mocked store/services                |
| `components/`       | Integration (RTL)   | **70%+**  | User interactions, not implementation details            |
| E2E                 | Critical flows only | Key paths | Create event, AI breakdown, drag & drop                  |

---

## Test Files Map

### Phase 0 (Bootstrap)

| Test File                       | Tests                        |
| ------------------------------- | ---------------------------- |
| `tests/unit/app.smoke.test.tsx` | App renders without crashing |

### Phase 1 (Calendar Views)

| Test File                                  | Tests                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `tests/unit/domain/dateHelpers.test.ts`    | Date formatting, range generation, edge cases (leap year, DST)                 |
| `tests/unit/store/calendarStore.test.ts`   | View switching, date navigation, today shortcut                                |
| `tests/integration/calendarViews.test.tsx` | MonthView renders correct days, WeekView shows correct hours, navigation works |

### Phase 2 (Event CRUD)

| Test File                                | Tests                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `tests/unit/domain/event.schema.test.ts` | Zod schema: valid event passes, invalid shapes throw                                 |
| `tests/unit/store/eventStore.test.ts`    | Create/update/delete actions, store state transitions                                |
| `tests/integration/eventCRUD.test.tsx`   | Click date → modal opens, fill form → event appears on calendar, delete → event gone |

### Phase 3 (Recurring Events)

| Test File                                     | Tests                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/domain/recurrence.test.ts`        | **100% coverage required** — daily/weekly/monthly rules, end conditions, edge cases (month boundaries, leap Feb 29) |
| `tests/unit/domain/recurrence.schema.test.ts` | Zod schema for recurrence rule                                                                                      |
| `tests/integration/recurringEvents.test.tsx`  | Create recurring event, instances appear, edit/delete this/following/all                                            |

### Phase 4 (Drag & Drop)

| Test File                             | Tests                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `tests/integration/dragDrop.test.tsx` | Drag event to new date → event date updated, drag to time slot → time updated |

### Phase 5 (Persistence)

| Test File                                         | Tests                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `tests/unit/services/localStorageAdapter.test.ts` | CRUD round-trip, serialization, empty state                                                  |
| `tests/unit/services/firestoreAdapter.test.ts`    | Legacy-only adapter CRUD with an injected in-memory client; never used by production startup |
| `tests/integration/syncManager.test.ts`           | Write local → verify synced to remote, offline queue → sync on reconnect                     |

### Phase 6 (AI Assistant)

| Test File                                      | Tests                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/unit/domain/ai.schema.test.ts`          | Valid/invalid AI response shapes, Zod validation errors                                                                                                                                                                                                                                          |
| `tests/unit/services/apiAIService.test.ts`     | OpenAI-compatible request shape, endpoint normalization, local time context prompt payload, missing key, invalid JSON, schema validation                                                                                                                                                         |
| `tests/unit/services/aiServiceFactory.test.ts` | API/local routing and legacy DeepSeek fallback config                                                                                                                                                                                                                                            |
| `tests/unit/services/localAIService.test.ts`   | Local provider currentDateTime handling for near-term relative time phrases                                                                                                                                                                                                                      |
| `tests/integration/aiAssistant.test.tsx`       | Type goal → AI panel shows steps, accept → events added to calendar; AI action plans create/update/delete events and create/update/delete/schedule todos; near-term event times require confirmation; current date is separated from focused calendar date; local provider works without API key |

### Phase 7 (E2E)

| Test File                       | Tests                                                                      |
| ------------------------------- | -------------------------------------------------------------------------- |
| `tests/e2e/createEvent.test.ts` | Full flow: open app → navigate to date → create event → verify on calendar |
| `tests/e2e/aiBreakdown.test.ts` | Open AI panel → type goal → accept suggestion → events on calendar         |
| `tests/e2e/dragAndDrop.test.ts` | Drag event → verify new date/time                                          |
| `tests/e2e/offlineSync.test.ts` | Create event offline → go online → verify synced                           |

### Backend Extension (Fridge Receipt Analysis)

| Test File                                      | Tests                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/backend/test_fridge_pipeline.py`        | Image upload validation, multipart parsing, OCR fallback decision, receipt parser, fridge filtering, cache/default/runtime behavior, atomic writes, inventory CRUD, DeepSeek fallback caching, malformed DeepSeek JSON, timezone-sensitive reminder dates |
| `tests/unit/services/fridgeApiService.test.ts` | Frontend fridge API multipart upload, inventory parsing, structured backend errors                                                                                                                                                                        |
| `tests/integration/fridgePanel.test.tsx`       | Receipt analysis UI, add analyzed item to inventory, schedule expiration reminder into calendar                                                                                                                                                           |

### 2026-07-15 Security, integrity, and packaging repair

| Test File                                   | Contract                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/backend/test_auth_api.py`            | Server budget import filtering, replace replay, dummy-hash reuse, IP/username throttles, lockout, CSRF and account isolation                                                      |
| `tests/backend/test_desktop_auth.py`        | AI operation enum, planning limit selection, HTML/invalid/truncated upstream responses, desktop token gate and local budget                                                       |
| `tests/backend/test_goal_control.py`        | ISO-week capacity, target/dependency boundaries, DST conversion, strict Check-in payloads, review periods, skipped completion, rolling summary and rollback evidence preservation |
| `tests/backend/test_integrity_audit.py`     | Orphan reporting, raw JSON quarantine, repair and clean re-audit                                                                                                                  |
| `tests/unit/services/appApiClient.test.ts`  | Credentials/CSRF headers, 401 boundary, actionable connection errors and in-flight request abortion on session epoch change                                                       |
| `tests/unit/store/resetUserSession.test.ts` | Account switch clears user data, AI drafts, import status and user-facing navigation state                                                                                        |

### To-Do and Event Type Extension

| Test File                                 | Tests                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tests/unit/store/eventTypeStore.test.ts` | Seeded editable event types, create, update, and archive actions                              |
| `tests/unit/store/todoStore.test.ts`      | Create, complete, reopen, and delete to-do actions                                            |
| `tests/integration/todoPanel.test.tsx`    | To-do panel creation, editable type creation, and typed to-do scheduling into calendar events |

### Settings and Tools Extension

| Test File                                          | Tests                                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/settingsPanel.test.tsx`         | Frontend runtime config save including AI API profile/model, local provider option visibility, input defaults, usage modes, and desktop backend config save |
| `tests/integration/fridgePanel.test.tsx`           | Fridge is opened through the Tools layer before receipt workflows                                                                                           |
| `tests/unit/components/toolsRegistry.test.ts`      | Tools registry includes Settings, Tool Sessions, and Fridge module entries                                                                                  |
| `tests/unit/domain/toolSessionPresets.test.ts`     | Built-in Tool Session presets load from individual preset folders                                                                                           |
| `tests/unit/services/runtimeConfigService.test.ts` | Legacy frontend DeepSeek provider config migrates to unified API config and API profile defaults are inferred                                               |

---

## MSW Setup (Backend and AI Mocking)

All tests that call external services use **MSW handlers** defined in `tests/mocks/`:

```
tests/
└── mocks/
    ├── handlers.ts          ← all MSW request handlers
    └── server.ts            ← MSW server setup for Node (Vitest)
```

**Key rule:** Tests must never make real network calls. CI should have no API keys.

---

## Running Tests

```powershell
& "C:\Program Files\nodejs\npm.cmd" run test:run
$env:PYTHONPATH="C:\Users\Zheng\Desktop\calendar app"; python -m unittest discover tests\backend
```

For receipt OCR manual QA, verify Tesseract is visible before starting the backend:

```powershell
tesseract --version
python -m backend.server
```

If Tesseract is installed but not detected in the current PowerShell session:

```powershell
$env:Path = "C:\Program Files\Tesseract-OCR;$env:Path"
tesseract --version
```

---

## Test Result History

| Date       | Phase                                               | Pass                                                                    | Fail    | Coverage     |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------------- | ------- | ------------ |
| 2026-05-26 | Phase 3                                             | 68                                                                      | 0       | Not measured |
| 2026-05-26 | Phase 4                                             | 74                                                                      | 0       | Not measured |
| 2026-05-26 | Phase 5                                             | 100                                                                     | 0       | Not measured |
| 2026-05-26 | Phase 6                                             | 121                                                                     | 0       | Not measured |
| 2026-06-06 | Fridge backend                                      | 15 Python + 121 Vitest                                                  | 0       | Not measured |
| 2026-06-07 | Fridge frontend                                     | 15 Python + 6 targeted Vitest                                           | 0       | Not measured |
| 2026-06-07 | To-do and event types                               | 15 Python + 136 Vitest                                                  | 0       | Not measured |
| 2026-06-07 | AI frontend actions                                 | 138 Vitest + AI smoke                                                   | 0       | Not measured |
| 2026-06-08 | Settings and Tools                                  | 15 Python + 140 Vitest                                                  | 0       | Not measured |
| 2026-06-08 | Expanded Settings                                   | 140 Vitest                                                              | 0       | Not measured |
| 2026-06-18 | AI API/local + tool registry refactor               | Pending final run                                                       | Pending | Not measured |
| 2026-07-13 | MySQL multi-user + desktop packaging                | 229 Vitest + 29 Python + 1 MySQL contract                               | 0       | Not measured |
| 2026-07-14 | Long-term goal control + AI usage modes             | 235 Vitest + 39 Python; MySQL conditional                               | 0       | Not measured |
| 2026-07-15 | Three-phase security, integrity, and release repair | 244 Vitest + 53 Python + 1 real MySQL contract + 3 clean desktop builds | 0       | Not measured |
| 2026-07-19 | 0.2.0 complete stabilization                        | 254 Vitest + 77 Python + 1 MySQL + 9 desktop E2E + 2 server E2E         | 0       | Not measured |

_(append after each test run)_

### 2026-07-13 - MySQL multi-user and desktop packaging

- `tests/backend/test_auth_api.py`: login/logout, no registration route, CSRF, lockout, password-session revocation, two-user ID reuse/isolation, backup idempotency.
- `tests/backend/test_desktop_auth.py`: desktop bootstrap launch-token enforcement and login-free local principal.
- `tests/backend/test_windowed_server.py`: windowed PyInstaller startup and parent-process watchdog probes.
- `tests/backend/test_mysql_contract.py`: optional real MySQL 8.0 Alembic-to-head and shared business-ID isolation contract; run with `npm.cmd run test:mysql`.
- `python -m unittest discover -s tests\backend`: SQLite repository/API contract suite.
- `cargo check --manifest-path src-tauri\Cargo.toml`: Tauri v2 sidecar lifecycle/runtime compile contract.
- `npm.cmd run desktop:build`: PyInstaller sidecar, bundled Tesseract, NSIS installer and portable ZIP smoke path.

The expected release gate is: lint, TypeScript/Vite build, full Vitest, backend suite, real MySQL suite, Cargo check, and both desktop artifacts present.

### 2026-07-14 - Goal control and AI usage modes

- `tests/backend/test_goal_control.py`: same-business-ID isolation, complete mock activation plan, dependency-cycle rejection, manual plan change and rollback, mode clamping, Soft/Hard budget behavior, deterministic Check-in, backup v2 inclusion/exclusion.
- `tests/backend/test_auth_api.py`: authenticated goal activation/dashboard isolation plus server mode/budget restrictions.
- `tests/backend/test_desktop_auth.py`: desktop local budget editing and automatic `20260714_0005` schema stamp.
- `tests/unit/domain/goalPlanningPrompt.test.ts`: Economy/Balanced/Quality context windows, rule-only Economy Check-in, approval and safety constraints, and mocked plan parsing.
- Full result: 47 Vitest files / 235 tests passed; 39 backend tests passed with the real-MySQL contract skipped when `CALENDAR_MYSQL_TEST_URL` is absent.
- Added coverage for buffered Standard capacity rejection, AI proposal wait/partial approval, five-minute manual version coalescing, rollback, and two-review medium-sensitivity replanning signals.
- Fresh SQLite upgraded from empty to `20260714_0005`; MySQL 8 static DDL generation reached the same head. A real MySQL rerun remains conditional because the local Docker daemon was unavailable.
- `cargo check` and `npm.cmd run desktop:build` passed with native notification support. The packaged sidecar smoke returned `health=ok`, `mode=desktop`, and `authRequired=false` using an ephemeral token.
- `npm.cmd audit --omit=dev` reports zero production dependency vulnerabilities after patch-level overrides for `form-data` and `protobufjs`.

### 2026-07-15 - Three-phase complete repair

- `npm.cmd run test:run`: 50 files / 244 tests passed, including account-session epoch cancellation, goal anchoring, mock activation plan, plan modification, and rollback.
- `python -m unittest discover tests.backend`: 53 tests passed; one real-MySQL contract was skipped because no MySQL URL was configured.
- `npm.cmd run lint`, `npm.cmd run build`, and `cargo check`: passed.
- Full and production-only `npm audit --audit-level=high`: zero vulnerabilities.
- Three clean `npm.cmd run desktop:build` runs passed with the same hash-locked input (`requirements-desktop.lock` SHA-256 `591D5697B827FB0C510D26913D8636326A8DA4E109544E209847271BCEB08E69`).
- All final desktop runs passed packaged sidecar random-port/token health checks and left no `calendar-backend` process. Installer, portable ZIP, Tesseract data, and license files were generated.
- Production frontend scan found no Firebase marker, `VITE_FIREBASE`, `VITE_AI_API_KEY`, or MySQL connection URL.
- `npm.cmd run test:mysql`: Docker MySQL 8.0 became healthy, Alembic upgraded an empty database through `20260715_0007`, the real multi-user repository contract passed, and the container/network/volume were removed.

### 2026-07-16 - Local-first desktop updater

- `tests/unit/store/desktopUpdateStore.test.ts`: installed update discovery/progress, portable release-page fallback, and one-time automatic checks.
- `tests/backend/test_update_backup.py`: authenticated backup endpoint, readable SQLite snapshot/checksum, semantic-version path hardening, and three-snapshot retention.
- `npm.cmd run version:check`: npm, lock file, Tauri JSON, and Cargo versions must match the pushed `v*` tag.
- Full result: 51 Vitest files / 247 tests passed; 56 backend tests passed with one conditional real-MySQL skip; ESLint, Vite build, Cargo check, signed NSIS/portable packaging, checksum verification, and npm audit passed.
- Release acceptance requires a draft `0.2.1` install over manually installed `0.2.0`, confirmation UI, a checksummed pre-update snapshot, preserved local data after restart, and no self-install attempt from the portable ZIP.

### 2026-07-19 - Calendar App 0.2.0 complete stabilization

- `npm.cmd run test:run`: 52 files / 254 tests passed.
- `python -m unittest discover -s tests/backend -p "test_*.py"`: 77 tests passed; the conditional MySQL test was skipped in this SQLite run.
- A fresh Docker MySQL 8 instance migrated from empty through `20260719_0008`; `tests.backend.test_mysql_contract` passed, then the dedicated container and temporary volume were removed.
- `npm.cmd run test:e2e:desktop`: 9 Chromium tests passed against an isolated SQLite database.
- `npm.cmd run test:e2e:server`: 2 Chromium tests passed against MySQL, covering CSRF writes, expired-session draft preservation, no automatic write replay, manual retry, real logout, and two-account isolation.
- The SQLite migration matrix covers empty, unmarked, 0006, false 0007, correct 0007, current head, unknown, and corrupt layouts, including source-hash preservation on failure.
- `npm.cmd run format:check`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run openapi:check`, and `npm.cmd run rust:check`: passed.
- `npm.cmd audit --audit-level=high`: zero vulnerabilities.
- `pip-audit` reported no known vulnerabilities in `requirements-server.lock` or `requirements-desktop.lock`.
- The clean-checkout Rust gate now creates and removes only a target-specific sidecar placeholder; release packaging still requires the real prepared sidecar and bundled Tesseract resources.
- `npm.cmd run desktop:build`: the packaged sidecar migration/health smoke passed; the signed NSIS installer, updater signature, portable ZIP, and SHA-256 manifest were generated and verified; no sidecar process remained afterward.
- Draft release creation remains blocked until the signed installer and portable package both pass the required clean-Windows migration and recovery smoke test.
