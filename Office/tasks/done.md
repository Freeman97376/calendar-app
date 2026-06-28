# ✅ Done — Completed Tasks

> Maintained by: Claude Code  
> Items are appended here when completed. Never deleted.

---

## Project Setup (Pre-Phase 0)

| Date | ID | Task |
|------|----|------|
| 2026-05-24 | — | Initial project scoping (tech stack, features, storage, AI approach agreed) |
| 2026-05-24 | — | Created `office/` management hub structure |
| 2026-05-24 | — | Created `CLAUDE.md` root config loader |
| 2026-05-24 | — | Created `office/claude.md` full supervisor config (v2.0) |
| 2026-05-24 | — | Created `office/planning/roadmap.md` |
| 2026-05-24 | — | Created `office/planning/architecture.md` |
| 2026-05-24 | — | Created ADR-001 through ADR-004 |
| 2026-05-24 | — | Migrated TASKS.md → `office/tasks/` (active-sprint + backlog) |
| 2026-05-24 | — | Created `office/tracking/`, `office/testing/`, `office/docs/`, `office/extensions/` |
| 2026-05-24 | — | Created `src/` 5-layer skeleton with placeholder files |
| 2026-05-24 | — | Created `tests/` skeleton |

---

## Phase 0 Bootstrap

| Date | ID | Task |
|------|----|------|
| 2026-05-25 | 0.1 | Added Vite + React + TypeScript project scaffold files |
| 2026-05-25 | 0.3 | Added ESLint flat config with layer boundary rules |
| 2026-05-25 | 0.4 | Added Prettier config |
| 2026-05-25 | 0.5 | Added Vitest + React Testing Library setup |
| 2026-05-25 | 0.6 | Added MSW Node server setup and Anthropic handler scaffold |
| 2026-05-25 | 0.7 | Added Tailwind/PostCSS setup and app CSS entry |
| 2026-05-25 | 0.8 | Confirmed `src/` and `tests/` skeletons exist |
| 2026-05-25 | 0.11 | Added app smoke test |

---

## Phase 1 Core Calendar Views

| Date | ID | Task |
|------|----|------|
| 2026-05-25 | 1.1 | Implemented `MonthView` |
| 2026-05-25 | 1.2 | Implemented `WeekView` |
| 2026-05-25 | 1.3 | Implemented `DayView` |
| 2026-05-25 | 1.4 | Implemented shared `TimeGrid` |
| 2026-05-25 | 1.5 | Implemented `ViewSwitcher` |
| 2026-05-25 | 1.6 | Implemented `CalendarHeader` |
| 2026-05-25 | 1.7 | Implemented `calendarStore` |
| 2026-05-25 | 1.8 | Implemented `useCalendar` |
| 2026-05-25 | 1.9 | Added unit tests for date helpers, calendar store, and calendar hook |
| 2026-05-25 | 1.10 | Added integration tests for view switching and navigation |

---

## Phase 2 Event CRUD

| Date | ID | Task |
|------|----|------|
| 2026-05-25 | 2.1 | Implemented and verified `Event` Zod schema |
| 2026-05-25 | 2.2 | Implemented and verified `EventModal` |
| 2026-05-25 | 2.3 | Implemented and verified controlled `EventForm` |
| 2026-05-25 | 2.4 | Implemented and verified `EventCard` |
| 2026-05-25 | 2.5 | Implemented and verified local Zustand `eventStore` and `uiStore` modal state |
| 2026-05-25 | 2.6 | Implemented and verified `useEvents` hook |
| 2026-05-25 | 2.7 | Wired and verified create-event flow |
| 2026-05-25 | 2.8 | Wired and verified edit-event flow |
| 2026-05-25 | 2.9 | Wired and verified delete-event flow with confirmation |
| 2026-05-25 | 2.10 | Added passing event schema and event store unit tests |
| 2026-05-25 | 2.11 | Added passing event CRUD integration tests |

---

## Phase 3 Recurring Events

| Date | ID | Task |
|------|----|------|
| 2026-05-26 | 3.1 | Implemented and verified `RecurrenceRule` Zod schema |
| 2026-05-26 | 3.2 | Implemented and verified range-bounded recurrence expansion |
| 2026-05-26 | 3.3 | Implemented and verified `RecurrenceSelector` UI |
| 2026-05-26 | 3.4 | Implemented and verified recurring edit scopes: this, following, all |
| 2026-05-26 | 3.5 | Implemented and verified recurring delete scopes: this, following, all |
| 2026-05-26 | 3.6 | Added passing recurrence schema and expansion unit tests |
| 2026-05-26 | 3.7 | Added passing recurring event integration and browser smoke tests |

---

## Phase 4 Drag & Drop

| Date | ID | Task |
|------|----|------|
| 2026-05-26 | 4.1 | Wired `@dnd-kit/core` `DndContext` in `CalendarShell` |
| 2026-05-26 | 4.2 | Made `EventCard` draggable while preserving click-to-edit behavior |
| 2026-05-26 | 4.3 | Implemented `EventDragOverlay` |
| 2026-05-26 | 4.4 | Added droppable month date cells and week/day time slots |
| 2026-05-26 | 4.5 | Implemented `useDragDrop` rescheduling logic |
| 2026-05-26 | 4.6 | Added recurring drag handling for this/following/all scopes |
| 2026-05-26 | 4.7 | Added passing drag/drop integration tests and browser smoke coverage |

---

## Phase 5 Persistence Layer

| Date | ID | Task |
|------|----|------|
| 2026-05-26 | 5.1 | Implemented `IStorageAdapter` consumers against the adapter contract |
| 2026-05-26 | 5.2 | Implemented schema-validated `LocalStorageAdapter` |
| 2026-05-26 | 5.3 | Added safe Firebase SDK config initialization |
| 2026-05-26 | 5.4 | Implemented injectable `FirestoreAdapter` |
| 2026-05-26 | 5.5 | Implemented local-first `SyncManager` |
| 2026-05-26 | 5.6 | Implemented offline queue and online flush behavior |
| 2026-05-26 | 5.7 | Wired `eventStore` and app startup to sync manager injection |
| 2026-05-26 | 5.8 | Added passing `LocalStorageAdapter` unit tests |
| 2026-05-26 | 5.9 | Added passing `FirestoreAdapter` tests with mocked client |
| 2026-05-26 | 5.10 | Added passing `SyncManager` integration tests |

---

## Phase 6 AI Assistant

| Date | ID | Task |
|------|----|------|
| 2026-05-26 | 6.1 | Implemented and verified `AIBreakdownResult` Zod schema |
| 2026-05-26 | 6.2 | Implemented `IAIService` consumers through the provider interface |
| 2026-05-26 | 6.3 | Implemented and verified Anthropic structured-output service |
| 2026-05-26 | 6.4 | Implemented optional Ollama JSON fallback |
| 2026-05-26 | 6.5 | Implemented `aiStore` |
| 2026-05-26 | 6.6 | Implemented `useAI` suggestion scheduling hook |
| 2026-05-26 | 6.7 | Implemented `AIAssistantPanel` |
| 2026-05-26 | 6.8 | Implemented `AIMessageBubble` |
| 2026-05-26 | 6.9 | Implemented `AIScheduleSuggestion` |
| 2026-05-26 | 6.10 | Wired accepted suggestions to calendar event creation |
| 2026-05-26 | 6.11 | Added no-key setup state |
| 2026-05-26 | 6.12 | Added passing AI schema and Anthropic service tests |
| 2026-05-26 | 6.13 | Added passing AI assistant integration tests |

---

## Feature Extensions

| Date | ID | Task |
|------|----|------|
| 2026-06-07 | EXT-1 | Added editable event/task type schema, store, local service, and event form integration |
| 2026-06-07 | EXT-2 | Added to-do schema, local service, Zustand store, and to-do panel |
| 2026-06-07 | EXT-3 | Linked scheduled todos to calendar events with `linkedTodoId`, `linkedEventId`, and shared `eventTypeId` |
| 2026-06-07 | EXT-4 | Added passing event type store, todo store, and todo panel integration tests |
| 2026-06-07 | EXT-5 | Added AI action plans for event and todo create/update/delete plus todo scheduling |
| 2026-06-07 | EXT-6 | Added local AI fallback and AI frontend smoke coverage |
| 2026-06-08 | EXT-7 | Added Settings panel for frontend runtime config and backend DeepSeek/fridge config |
| 2026-06-08 | EXT-8 | Moved Fridge under the Tools side panel and verified Fridge workflows through Tools |
| 2026-06-08 | EXT-9 | Expanded Settings to include AI model, Firebase startup config, input defaults, and editable event/task types |

---

*(Phase task completions will be logged here as development progresses)*
