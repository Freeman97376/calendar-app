# Progress Tracker

> Maintained by: Claude Code / Codex | Last updated: 2026-07-15

---

## Phase Completion Overview

| Phase | Name | Progress | Status |
|-------|------|----------|--------|
| Pre-0 | Project Setup | 100% | Done |
| 0 | Bootstrap | 100% (8/8) | Done |
| 1 | Calendar Views | 100% (10/10) | Done |
| 2 | Event CRUD | 100% (11/11) | Done |
| 3 | Recurring Events | 100% (7/7) | Done |
| 4 | Drag & Drop | 100% (7/7) | Done |
| 5 | Persistence Layer | 100% (10/10) | Done |
| 6 | AI Assistant | 100% (13/13) | Done |
| 7 | Polish & QA | 50% (5/10) | Active sprint |

**Overall:** Core feature phases are complete. The 2026-07-15 repair release has implemented its security/AI/desktop and long-term-plan/data-integrity changes; final full-suite, real-MySQL, and packaged Windows smoke verification are the remaining release gates.

---

## Milestone Log

| Date | Milestone |
|------|-----------|
| 2026-05-24 | Project kickoff - office structure, architecture, and task board created |
| 2026-05-25 | Phase 0 bootstrap verified |
| 2026-05-25 | Phase 1 calendar views verified |
| 2026-05-25 | Phase 2 event CRUD verified |
| 2026-05-26 | Phase 3 recurring events verified |
| 2026-05-26 | Phase 4 drag and drop verified |
| 2026-05-26 | Phase 5 persistence layer verified |
| 2026-05-26 | Phase 6 AI assistant verified |
| 2026-06-07 | To-do list and editable event/task type extension verified |
| 2026-06-07 | AI frontend action planning and application verified |
| 2026-06-08 | Settings and Tools layer verified |
| 2026-07-15 | Security, AI proxy, account reset, goal-control integrity, reproducible locks and release governance repair implemented |

### 2026-07-15 - Staged repair release

- Added database-backed login throttle buckets, integrity quarantine, composite user-scoped foreign keys, and migration head `20260715_0007`.
- Normalized AI operation routing and upstream errors; formal calendar/goal planning now use planning limits, while invalid/truncated provider responses cannot masquerade as parse-template failures.
- Replaced desktop port reservation and command-line token passing with a sidecar-owned socket plus stdout handshake.
- Added session epochs and one account reset path covering calendar, todos, memory, fridge, Tools, AI drafts, imports, UI and capabilities.
- Added ISO-week capacity validation, project timezone/DST Check-ins, strict answer payloads, completed-review semantics, rolling summaries, relation validation and evidence-preserving rollback.
- Removed Firebase and Anthropic from the production runtime, added an operator-only legacy Firebase exporter, upgraded npm security-sensitive dependencies, and generated hash-locked Python environments.
- Added packaged third-party notices and license resources. Full release verification results must be recorded in `office/testing/test-plan.md` before publishing.

---

## Session Log

### 2026-05-24 - Session 1

**What happened:**

- Defined tech stack: React + TS + Vite, Zustand, Tailwind, Firebase Firestore, Claude API.
- Defined features: Month/Week/Day views, Event CRUD, recurring events, drag and drop, AI assistant.
- Created complete `Office/` management structure.
- Authored 4 Architecture Decision Records.
- Created 5-layer `src/` architecture skeleton.
- Created full `tests/` skeleton.

**Decisions made:**

- AI output enforced via Zod schema + Claude tool use (ADR-003).
- Storage via adapter interface pattern (ADR-002).
- Flat monorepo-ready structure (ADR-001).
- Zustand over Redux (ADR-004).

### 2026-05-25 - Session 2

**What happened:**

- Added `package.json` with runtime and dev dependency declarations.
- Added Vite, TypeScript, Vitest, Playwright, ESLint, Prettier, Tailwind, and PostCSS config files.
- Added `index.html`, `src/index.css`, and wired the React entry point.
- Replaced the placeholder `App` with a minimal accessible app shell.
- Added `tests/setupTests.ts` and `tests/unit/app.smoke.test.tsx`.
- Replaced MSW placeholders with a real Node server setup and Anthropic mock handler.

### 2026-05-25 - Session 3

**What happened:**

- Implemented `src/domain/logic/dateHelpers.ts` with month grid, week/day helpers, titles, ranges, and date shifting.
- Implemented `src/store/calendarStore.ts` with Zustand state and navigation actions.
- Implemented `src/hooks/useCalendar.ts` for derived calendar data.
- Implemented `CalendarShell`, `CalendarHeader`, `ViewSwitcher`, `MonthView`, `WeekView`, `DayView`, and `TimeGrid`.
- Wired `App` to render the calendar shell.
- Added tests for date helpers, calendar store, `useCalendar`, and calendar view interactions.

### 2026-05-25 - Session 4

**What happened:**

- Node.js v24.16.0 installed; npm 11.13.0 available under `C:\Program Files\nodejs`.
- `npm install` completed.
- Phase 0 and Phase 1 were verified with 21 passing tests.
- Advanced active sprint to Phase 2.

### 2026-05-25 - Session 5

**What happened:**

- Implemented Phase 2 Event CRUD.
- Added `EventSchema` with defaults and end-after-start validation.
- Added domain event utilities for creation, update, sorting, filtering, grouping, and overlap checks.
- Implemented local Zustand `eventStore` and `uiStore`.
- Implemented `useEvents` for visible events, modal state, save/delete actions, and date grouping.
- Implemented `Button`, `Modal`, `Spinner`, `EventCard`, `EventForm`, and `EventModal`.
- Wired Month/Week/Day views to open create flow and render/edit event cards.
- Added event schema, event store, and event CRUD integration tests.
- Fixed lint issues in placeholder todo tests.

**Verification:**

- Vitest: 43 passing, 0 failing, 49 todo.
- ESLint: passing.
- TypeScript build: passing.
- Vite production build: passing.
- Browser smoke: passing using installed Microsoft Edge.

### 2026-05-26 - Session 6

**What happened:**

- Implemented Phase 3 Recurring Events.
- Added `RecurrenceRuleSchema` for daily, weekly, monthly, custom interval, and never/date/count end rules.
- Implemented range-bounded recurrence expansion with local-clock handling, deleted occurrences, monthly clamping, leap-year behavior, and synthetic instance IDs.
- Wired recurring event expansion into visible event queries and date grouping.
- Added recurrence controls to `EventForm`.
- Added recurring edit/delete scopes for this event, this and following, and all events.
- Added instance exceptions and deleted occurrence handling in `eventStore`.
- Preserved editing context for synthetic recurring instances with an event snapshot in `uiStore`.
- Fixed count-limited split behavior so "this and following" keeps only remaining occurrences when the recurrence rule is unchanged.
- Prevented TypeScript config declaration/JS emission and ignored generated config artifacts.
- Added recurrence unit, schema, integration, and browser smoke coverage.

**Verification:**

- Vitest: 68 passing, 0 failing, 35 todo.
- ESLint: passing.
- TypeScript build: passing.
- Vite production build: passing.
- Browser smoke: passing using `scratch/test-scripts/phase3-smoke.mjs`.

**Next session should start with:** Phase 4 drag and drop.

### 2026-05-26 - Phase 3 Review (Supervisor)

**Review findings:**

- All Phase 3 files reviewed: `recurrence.schema.ts`, `recurrence.ts`, `eventUtils.ts`, `RecurrenceSelector.tsx`, `EventForm.tsx`, `useEvents.ts`, `eventStore.ts`, and all 3 Phase 3 test files.
- `EventSchema` correctly includes `exceptionFor`, `exceptionDate`, `masterId`, and `deletedOccurrences` — no data loss risk.
- `recurrenceRule` uses typed `RecurrenceRuleSchema` (not `z.unknown()`).
- Expansion wiring confirmed: `getEventsInRange` calls `expandRecurrence` for master events.
- All 3 edit/delete scopes verified correct; `getFollowingRecurrenceRule` count adjustment is correct.
- 14 + 5 + 7 = 26 Phase 3 tests confirmed fully implemented.

**Fixes applied (autonomous — test files):**

1. Fixed DST test in `recurrence.test.ts`: Changed `getHours()` → `getUTCHours()` so assertion is timezone-independent and passes in UTC CI.
2. Added missing `superRefine` test to `recurrence.schema.test.ts`: `weekly` with `daysOfWeek: []` should throw.

**Pending approval (src/ changes):**

- `expandMonthly` double-computation: minor inefficiency (calls `monthlyOccurrence` twice per loop iteration). Awaiting approval to fix in `src/domain/logic/recurrence.ts`.

**Correction from Session 7:** The DST assertion now checks local clock hours. Preserving local time across DST intentionally shifts UTC hour, so UTC-hour equality is not the correct invariant.

### 2026-05-26 - Session 7

**What happened:**

- Implemented Phase 4 Drag & Drop.
- Wrapped the calendar in `@dnd-kit/core` `DndContext` with pointer, mouse, and keyboard sensors.
- Made `EventCard` draggable while preserving click-to-edit behavior.
- Added droppable targets for month date cells and week/day time slots.
- Implemented `useDragDrop` to reschedule events through the existing event store.
- Added month-date drops that preserve event time and time-slot drops that update date and hour while preserving duration.
- Added recurring drag support through this / following / all scope prompts, using the existing recurrence mutation path.
- Added a drag overlay and visible drop-target highlight.
- Added integration tests for date drops, time-slot drops, recurring this/following behavior, and cancelled recurring drags.
- Added a browser smoke script for real mouse drag behavior.

**Verification:**

- Vitest: 74 passing, 0 failing, 35 todo.
- ESLint: passing.
- TypeScript build: passing.
- Vite production build: passing.
- Browser smoke: passing using `scratch/test-scripts/phase4-smoke.mjs`.

**Next session should start with:** Phase 5 persistence layer.

### 2026-05-26 - Session 8

**What happened:**

- Implemented Phase 5 Persistence Layer.
- Completed `LocalStorageAdapter` with schema-validated serialization, CRUD operations, range filtering, and clear support.
- Added Firebase SDK configuration that safely returns `null` when env credentials are missing.
- Implemented `FirestoreAdapter` behind the `IStorageAdapter` interface with an injectable Firestore client for tests.
- Implemented `SyncManager` for local-first writes, remote sync attempts, offline queueing, queue flush, and last-write-wins conflict handling.
- Added default sync manager setup and wired app startup through `configureEventSync`.
- Wired `useEvents` to load events for the visible range.
- Added event store tests for sync manager injection.
- Added localStorage, Firestore adapter, and sync manager tests.
- Added a browser smoke script for reload persistence.

**Verification:**

- Vitest: 100 passing, 0 failing, 21 todo.
- ESLint: passing.
- TypeScript build: passing.
- Vite production build: passing with Firebase bundle-size warning.
- Browser smoke: passing using `scratch/test-scripts/phase5-smoke.mjs`.

**Next session should start with:** Phase 6 AI assistant.

### 2026-05-26 - Session 9

**What happened:**

- Implemented Phase 6 AI Assistant.
- Tightened `AIBreakdownResultSchema` validation.
- Implemented `AnthropicService` using structured tool-use payloads and Zod validation.
- Implemented optional `OllamaService` JSON fallback behind explicit enablement.
- Added default AI service selection and app startup configuration.
- Implemented `aiStore` with messages, loading, errors, availability, and pending suggestions.
- Implemented `useAI` to schedule accepted AI steps into calendar events.
- Added `AIAssistantPanel`, `AIMessageBubble`, and `AIScheduleSuggestion`.
- Wired the AI panel toggle into the calendar header.
- Added AI schema, Anthropic service, and AI assistant integration tests.
- Added a browser smoke script for no-key setup behavior.

**Verification:**

- Vitest: 121 passing, 0 failing, 0 todo.
- ESLint: passing.
- TypeScript build: passing.
- Vite production build: passing with bundle-size warning.
- Browser smoke: passing using `scratch/test-scripts/phase6-smoke.mjs`.

**Next session should start with:** Phase 7 polish and QA.

### 2026-05-26 - Session 10

**What happened:**

- Started Phase 7 Polish & QA.
- Implemented a real `ErrorBoundary` and wrapped the calendar shell.
- Added event loading status.
- Improved responsive layout for the AI panel.
- Added keyboard arrow navigation for the view switcher.
- Added Vite manual chunks for vendor, Firebase, and drag/drop packages.
- Replaced E2E todo specs with runnable Playwright tests for create/reload, drag/drop, and AI no-key panel behavior.

**Verification:**

- ESLint: passing after Phase 7 edits.
- TypeScript build: passing after Phase 7 edits.
- Playwright E2E: not run; blocked by desktop escalation usage limit.
- Final Vite production build after manual chunks: not run for the same escalation constraint.

**Next session should start with:** run Playwright E2E and production build, then complete Phase 7 final review.

### 2026-05-26 - Session 11

**What happened:**

- Fixed the AI assistant browser `fetch` invocation path for both Ollama and Anthropic services.
- Confirmed the live localhost app no longer logs `Illegal invocation` when submitting an Ollama-backed goal.

**Verification:**

- ESLint: passing for `src/services/ai`.
- TypeScript build: passing.
- Targeted Vitest: `tests/unit/services/anthropicService.test.ts` passing, 7 tests.
- Live browser check: AI assistant submitted a local Ollama goal and completed without console errors.

**Next session should start with:** run the remaining Phase 7 Playwright E2E and production build verification.

### 2026-06-06 - Session 12

**What happened:**

- Added a standalone Python backend for fridge receipt analysis under `backend/`.
- Added `POST /api/fridge/receipt/analyze` with multipart image upload parsing.
- Added local-first OCR using the `tesseract` CLI when installed.
- Added local receipt parsing, fridge/freezer classification, shelf-life defaults, and persistent JSON shelf-life cache.
- Added DeepSeek backend integration with `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`.
- Added strict DeepSeek JSON parsing and explicit errors for missing key, timeout, rate limit, request failure, and invalid responses.
- Added reminder suggestion output because the current app has no backend event creation API.
- Added `README.md` backend usage docs and `.env.example` DeepSeek entries.

**Verification:**

- Python compile: passing for `backend/`.
- Backend unit tests: `python -m unittest discover tests/backend` passing, 9 tests.
- ESLint: passing.
- TypeScript build: passing.
- Full Vitest regression: passing, 121 tests.
- Vite production build: passing with existing large vendor chunk warning.
- Vite production build: passing with existing large vendor chunk warning.

**Next session should start with:** frontend UI for uploading receipts and converting `reminder_suggestions` into calendar events.

### 2026-06-06 - Session 13

**What happened:**

- Stabilized receipt analysis response contract with `receipt_id`, response confidence, source, candidates, trace steps, cache metadata, and structured recoverable errors.
- Added stable fridge backend error codes for invalid image/request, OCR unavailable/empty, DeepSeek timeout/rate-limit/request/malformed/missing-key, no fridge items, and inventory item not found.
- Split shelf-life data into tracked defaults and runtime learned cache.
- Added `FRIDGE_DATA_DIR` support.
- Added persistent fridge inventory storage in `backend/fridge/store.py`.
- Added inventory CRUD endpoints for `GET/POST/PATCH/DELETE /api/fridge/items`.
- Added timezone-aware default purchase date handling with an `America/Los_Angeles` fallback for Python installs without IANA timezone data.

**Verification:**

- Python compile: passing for `backend/`.
- Backend unit tests: `python -m unittest discover tests/backend` passing, 15 tests.
- ESLint: passing.
- TypeScript build: passing.
- Full Vitest regression: passing, 121 tests.

**Next session should start with:** frontend receipt upload UI and inventory/reminder integration.

### 2026-06-07 - Session 14

**What happened:**

- Added frontend fridge response schemas and typed domain exports.
- Added `FridgeApiService` with multipart receipt upload, inventory CRUD calls, and Zod response validation.
- Added `fridgeStore`, `useFridge`, and `useFridgePanel`.
- Added a `Fridge` side panel for receipt upload, analyzed fridge items, inventory, item removal, and scheduling expiration reminders.
- Wired `reminder_suggestions` into the existing calendar event store as all-day events.
- Added `VITE_FRIDGE_API_BASE_URL` configuration.

**Verification:**

- TypeScript build: passing.
- Backend unit tests: `python -m unittest discover tests/backend` passing, 15 tests.
- Targeted frontend tests: `tests/unit/services/fridgeApiService.test.ts` and `tests/integration/fridgePanel.test.tsx` passing, 6 tests.
- ESLint: passing.
- Full Vitest regression: passing, 127 tests.
- Vite production build: passing with existing large vendor chunk warning.

**Next session should start with:** browser/manual QA for the fridge panel with a real receipt image and local backend.

### 2026-06-07 - Session 15

**What happened:**

- Added `eventTypeId` to the calendar event schema so events can distinguish general events, projects, deadlines, and user-defined categories.
- Added `linkedTodoId` on events and `linkedEventId` on todos for explicit calendar/to-do linkage.
- Added `EventTypeSchema` and `TodoSchema`.
- Added local event type and to-do services backed by `localStorage`.
- Added `eventTypeStore`, `todoStore`, `useEventTypes`, `useTodos`, and `useTodoPanel`.
- Added a `Todos` side panel with task creation, status changes, completion/reopen, scheduling to calendar, and deletion.
- Added editable event/task type management with create, update, and archive actions; type values are stored data rather than hardcoded schema enums.
- Wired event type selection into the event form and event cards.
- Added tests for event type store, to-do store, and todo panel scheduling into calendar events.

**Verification:**

- TypeScript build: passing.
- ESLint: passing.
- Full Vitest regression: passing, 136 tests.
- Vite production build: passing with existing large vendor chunk warning.
- Backend unit tests: `python -m unittest discover tests\backend` passing, 15 tests, with `PYTHONPATH` set to the repo root.

**Next session should start with:** browser/manual QA for the Todos panel and then optional Playwright E2E coverage for to-do scheduling.

### 2026-06-07 - Session 16

**What happened:**

- Expanded AI output beyond goal breakdown into explicit calendar/todo action plans.
- Added typed AI actions for event create/update/delete, todo create/update/delete, and todo scheduling.
- Added AI action context containing current events, todos, event types, focused date, and timezone.
- Extended Anthropic and Ollama services with action-plan generation.
- Added a local fallback AI service so frontend functions can be exercised even without a reachable model provider.
- Added an AI command form and review/apply action plan flow to the AI panel.
- Wired action application through existing event and todo stores.
- Added integration tests proving AI can apply the main event and todo functions.
- Added `scratch/test-scripts/ai-frontend-smoke.mjs` for local browser smoke verification.

**Verification:**

- TypeScript build: passing.
- ESLint: passing.
- AI-focused Vitest: passing, 23 tests.
- Full Vitest regression: passing, 138 tests.
- Vite production build: passing with existing large vendor chunk warning.
- AI frontend smoke: passing against `http://127.0.0.1:5173/`.

**Next session should start with:** manual user testing of real Anthropic/Ollama responses, then improve prompts/parsing based on observed commands.

### 2026-06-08 - Session 17

**What happened:**

- Added runtime config schemas for frontend settings and backend config status/update payloads.
- Added runtime config persistence through `localStorage`.
- Added service reconfiguration so saved frontend settings immediately update AI and fridge services.
- Added backend `GET/PATCH /api/config` for local DeepSeek/fridge settings.
- Backend config status does not return the existing DeepSeek secret; saving a new key writes `.env.local`, updates process env, and rebuilds fridge analyzer/store instances.
- Added a Settings panel for Fridge API, Anthropic, Ollama, DeepSeek, DeepSeek model/base URL, and fridge data directory.
- Moved Fridge under a `Tools` side panel with Settings and Fridge tool tabs.
- Updated Fridge integration tests to open through Tools.
- Added Settings integration tests.

**Verification:**

- TypeScript build: passing.
- ESLint: passing.
- Targeted Settings/Fridge Vitest: passing, 5 tests.
- Full Vitest regression: passing, 140 tests.
- Python backend compile: passing.
- Backend unit tests: `python -m unittest discover tests\backend` passing, 15 tests.
- Vite production build: passing with existing large vendor chunk warning.

**Next session should start with:** live local Settings test with a real DeepSeek key, then a receipt analysis that requires DeepSeek fallback.

### 2026-07-13 - MySQL multi-user server and login-free desktop modes

**What changed:**

- Replaced split SQLite/JSON personal stores with user-scoped SQLAlchemy repositories and added a forward Alembic revision after `20260708_0001`.
- Added Argon2 accounts, hashed opaque sessions, CSRF protection, lockout/session revocation, operator-only user CLI, and bilingual login gating without registration.
- Replaced the old HTTP server with FastAPI/Uvicorn while preserving `python -m backend.server`.
- Routed calendar, todo, event types, memory, fridge, tool presets, preferences, backup/import, and AI calls through the authenticated API.
- Added versioned merge/replace backups, safe legacy-browser export, and idempotent SQLite/JSON migration reporting.
- Added Tauri v2/PyInstaller desktop packaging with a random localhost port, temporary launch token, SQLite data directory, Windows Credential Manager, bundled Tesseract, sidecar shutdown, installer and portable ZIP outputs.
- Added SQLite/API auth tests, optional real MySQL 8.0 container tests, Cargo validation, and desktop sidecar smoke coverage.

**Verification:**

- `npm.cmd run lint`: passing.
- `npm.cmd run test:run`: 45 files and 229 tests passing.
- `python -m unittest discover -s tests\backend`: 29 tests passing with one conditional MySQL skip.
- `npm.cmd run test:mysql`: MySQL 8.0 empty-database Alembic upgrade and two-user repository isolation passing; container/network removed afterward.
- Vite production build and Tauri release compile: passing; frontend artifact scan found no MySQL URL, VITE AI-key entry, DeepSeek key assignment, or fixed development API URL.
- Final packaged sidecar: invalid launch token returns 401, desktop bootstrap is login-free, SQLite data survives restart, and bundled Tesseract 5.5 runs.
- Final Tauri lifecycle: normal close and simulated parent crash both leave zero sidecar processes.
- Final outputs: `Calendar App Setup.exe` (49.3 MB) and `Calendar App Portable.zip` (60.5 MB).

**Release order:** backup database, migrate, create administrator, import legacy data, verify a second isolated account, switch frontend API, build/smoke both desktop packages, then deploy documentation.

### 2026-06-08 - Session 18

**What happened:**

- Expanded runtime settings to cover Anthropic model, Firebase startup config fields, fridge API URL, and event/task input defaults.
- Wired Anthropic model selection into the frontend AI service.
- Wired event creation defaults into the event form: default type, color, start time, and end time.
- Wired task creation defaults into the to-do form: default task type and priority.
- Reused the editable event/task type manager inside Settings while keeping it available from the Todos panel.
- Updated Firebase initialization to read saved runtime Firebase config on app reload.
- Updated `.env.example` with frontend model and input-default environment variables.
- Expanded Settings integration coverage for the new runtime fields.

**Verification:**

- TypeScript build: passing.
- ESLint: passing.
- Targeted Settings/Todo/Event/Firebase/Anthropic Vitest: passing, 26 tests.
- Full Vitest regression: passing, 140 tests.
- Vite production build: passing with existing large vendor chunk warning.
- In-app browser smoke check: blocked by local browser runtime startup failure.

**Next session should start with:** manual Settings smoke check in the running app, then decide whether Firebase config should support hot reinitialization without reload.

### 2026-07-14 - Long-term goal control and Activated Tools full page

**What changed:**

- Added Alembic revisions `20260714_0003` through `20260714_0005` for goal conversations, metrics, Check-ins, proposals, control policies, plan versions/dependencies, effort, action/event links, and AI usage accounting.
- Added user-scoped goal-control APIs and transactional activation, deterministic Check-ins, metric confidence/anomaly data, dependency cycle protection, health factors, critical path, version retention/rollback, and backup v2.
- Added three AI usage modes with global and per-goal selection, administrator clamping, routine/planning models, request token caps, monthly Soft/Hard limits, 90-day raw-event retention, and rules-only degradation.
- Moved Templates to compact links, added a recoverable goal conversation with selectable `QuestionBatch` replies, and required plan preview confirmation before activation.
- Expanded Active Tools into a full workspace with planning brief, usage mode, KPI trends, capacity, Milestones, critical path, plan table, Check-in, versions, rollback, and the same goal conversation.
- Added Settings usage controls and monthly token reporting. Server budgets/models remain operator-owned; desktop budgets are editable locally.

**Verification:**

- `npm.cmd run lint`: passing.
- `npm.cmd run test:run`: 47 files / 235 tests passing.
- `npm.cmd run build`: passing.
- `python -m unittest discover tests.backend`: 36 tests passing; real MySQL skipped when no test URL is configured.
- Empty SQLite Alembic upgrade reaches `20260714_0005`.

### 2026-07-14 - Goal-control approval and desktop release closeout

**What changed:**

- Routed AI-generated Activated Tool plan edits through version-bound `PlanChangeProposal` records; no Milestone, Action or AI progress note is written until user approval.
- Added per-difference accept/reject, server-calculated capacity and calendar impact, stale-base protection, partial acceptance and a new confirmed version.
- Enforced the Standard/Minimum 80% buffered weekly-capacity boundary for activation, accepted proposals and rollback snapshots.
- Added deterministic medium-sensitivity review triggers, low-confidence/anomaly confirmation warnings, Check-in freshness/blocker health factors and capacity-based critical-path/Milestone predictions.
- Coalesced continuous manual structural edits into one version for five minutes.
- Added Tauri native notifications for pending Check-ins; notification discovery remains rule-only and does not call AI.

**Verification:**

- `npm.cmd run lint`: passing.
- `npm.cmd run test:run`: 47 files / 235 tests passing.
- `npm.cmd run build`: passing.
- `python -m unittest discover tests.backend`: 39 tests passing; one real-MySQL contract skipped because Docker/MySQL was unavailable.
- Fresh SQLite migration and MySQL offline DDL both reach `20260714_0005`.
- `cargo check --manifest-path src-tauri\Cargo.toml`: passing.
- `npm.cmd run desktop:build`: produced the standardized installer and portable ZIP.
- Packaged sidecar smoke: `/api/health` returned `ok`; authenticated desktop bootstrap returned `mode=desktop`, `authRequired=false`.
- Process-tree shutdown smoke left zero `calendar-backend` processes; `npm.cmd audit --omit=dev` reports zero production dependency vulnerabilities.

### 2026-07-15 - Three-phase security, integrity, and release repair

**What changed:**

- Closed server budget import bypasses, fixed merge/replace replay semantics, and added complete user-session state invalidation with in-flight request cancellation.
- Added the fixed AI operation contract, routine/planning routing, normalized upstream errors, truncation detection, DB-backed login throttling, trusted-proxy handling, and a single dummy Argon2 hash.
- Reworked the desktop handshake around backend-owned random-port binding, stdout-only one-time launch tokens, 15-second Tauri readiness checks, and full PyInstaller process-tree cleanup.
- Added ISO-week capacity enforcement, IANA/DST Check-in scheduling, strict answer schemas, completed-review semantics, rolling summaries, transactional relation validation, composite foreign keys, quarantine, and the integrity audit CLI.
- Removed Firebase and Anthropic from the production path, added hash-locked server/desktop Python inputs, third-party notices, bundled licenses, and separate deployment/migration documentation.

**Verification:**

- ESLint, Vite production build, Cargo check, 244 Vitest tests, and 53 Python tests passed.
- Full and production npm audits report zero vulnerabilities.
- Three clean desktop builds passed from the same lock hash and produced `Calendar App Setup.exe` and `Calendar App Portable.zip`; final sidecar smoke tests used a random port/token, scrubbed the temporary handshake pipe, and left zero backend processes.
- Production bundle scan found no Firebase marker, Vite AI/Firebase key variable, or MySQL connection URL.
- Real MySQL 8 Docker testing passed: empty-database Alembic migration reached `20260715_0007`, the multi-user contract passed, and all test container resources were removed.

### 2026-06-11 - Environment Documentation Update

**What happened:**

- Updated `Office/docs/onboarding.md` with the current Windows setup path.
- Documented `.env.local` usage, Python venv creation, frontend/backend startup commands, in-app Settings configuration, and receipt-flow testing.
- Added explicit Tesseract OCR detection guidance: `tesseract --version` must pass in the same PowerShell session that starts `python -m backend.server`.
- Added the temporary PATH fix for default Windows Tesseract installs: `$env:Path = "C:\Program Files\Tesseract-OCR;$env:Path"`.
- Updated `Office/testing/test-plan.md` and `Office/tasks/active-sprint.md` with OCR verification notes.

**Verification:**

- Documentation-only update; no automated tests run.
- Current code worktree includes unfinished Tool Sessions implementation work and should be verified before claiming a new green baseline.

### 2026-07-16 - Local-first signed desktop updates

**What changed:**

- Added Tauri's signed updater with a public GitHub Release feed, user-confirmed NSIS installation, restart support, and a fixed release-page command for portable builds.
- Added a local FastAPI/SQLite pre-update backup endpoint with SHA-256 metadata and three-snapshot retention; it is unavailable in MySQL server mode.
- Added startup/manual update state, Settings controls, progress/error UI, and a portable-only notification path.
- Synchronized version `0.2.0` across npm, Tauri, and Cargo; added guarded version scripts and a Windows x64 tag workflow that creates draft releases.
- Split desktop preparation, Tauri signing/build, and portable/checksum packaging into reusable scripts.

**Release boundary:**

- `0.2.0` must be installed manually. Automatic installed-app updates begin with a published, signed `0.2.1` release.
- Personal data, OCR, business APIs, and the SQLite snapshot remain local. DeepSeek is contacted by the local sidecar using the Windows Credential Manager key. The optional MySQL web server stays independent and does not synchronize desktop data.

**Verification:**

- 247 Vitest tests and 56 backend tests passed; the optional real-MySQL test was skipped because no test URL was configured.
- ESLint, production Vite build, Cargo check/format, workflow YAML parsing, version consistency, and `npm audit` passed.
- A full signed build produced the NSIS installer/signature, portable ZIP, and a SHA-256 manifest whose three entries were independently rechecked.
