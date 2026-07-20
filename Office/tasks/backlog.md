# 📦 Backlog — Phases 1–7

> Maintained by: Claude Code | Last updated: 2026-05-24  
> Items here move to [active-sprint.md](active-sprint.md) when their phase begins.  
> Status legend: ⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

## Phase 1 — Core Calendar Views

| ID   | Task                                                     | Status | Notes                          |
| ---- | -------------------------------------------------------- | ------ | ------------------------------ |
| 1.1  | Build `MonthView` component                              | ⬜     | Grid of 35/42 day cells        |
| 1.2  | Build `WeekView` component                               | ⬜     | 7-column hourly grid           |
| 1.3  | Build `DayView` component                                | ⬜     | Single-column hourly grid      |
| 1.4  | Build `TimeGrid` shared component                        | ⬜     | Shared by WeekView and DayView |
| 1.5  | Build `ViewSwitcher` (Month/Week/Day toggle)             | ⬜     |                                |
| 1.6  | Build `CalendarHeader` (prev/next/today nav)             | ⬜     |                                |
| 1.7  | Wire up `calendarStore` (view + focused date)            | ⬜     | Zustand store                  |
| 1.8  | Implement `useCalendar` hook                             | ⬜     |                                |
| 1.9  | Write unit tests: `useCalendar`, `calendarStore`         | ⬜     | _Supervisor writes_            |
| 1.10 | Write integration tests: view switching, date navigation | ⬜     | _Supervisor writes_            |

---

## Phase 2 — Event CRUD

| ID   | Task                                              | Status | Notes               |
| ---- | ------------------------------------------------- | ------ | ------------------- |
| 2.1  | Define `Event` Zod schema (`event.schema.ts`)     | ⬜     |                     |
| 2.2  | Build `EventModal` (Create/Edit form container)   | ⬜     |                     |
| 2.3  | Build `EventForm` (controlled form inside modal)  | ⬜     |                     |
| 2.4  | Build `EventCard` (display on calendar)           | ⬜     |                     |
| 2.5  | Implement `eventStore` (Zustand + CRUD actions)   | ⬜     |                     |
| 2.6  | Implement `useEvents` hook                        | ⬜     |                     |
| 2.7  | Wire Create event (click date → modal → save)     | ⬜     |                     |
| 2.8  | Wire Edit event (click event card → modal → save) | ⬜     |                     |
| 2.9  | Wire Delete event (delete button + confirmation)  | ⬜     |                     |
| 2.10 | Write CRUD unit tests                             | ⬜     | _Supervisor writes_ |
| 2.11 | Write CRUD integration tests (RTL)                | ⬜     | _Supervisor writes_ |

---

## Phase 3 — Recurring Events

| ID  | Task                                               | Status | Notes                                        |
| --- | -------------------------------------------------- | ------ | -------------------------------------------- |
| 3.1 | Define `RecurrenceRule` Zod schema                 | ⬜     | daily/weekly/monthly/custom + end conditions |
| 3.2 | Implement `recurrence.ts` (rule → event instances) | ⬜     | Pure function in `domain/logic/`             |
| 3.3 | Build `RecurrenceSelector` UI component            | ⬜     |                                              |
| 3.4 | Handle "edit this / all / following" for recurring | ⬜     |                                              |
| 3.5 | Handle "delete this / all / following"             | ⬜     |                                              |
| 3.6 | Write recurrence logic unit tests                  | ⬜     | _Supervisor writes_ — 100% target            |
| 3.7 | Write recurrence UI integration tests              | ⬜     | _Supervisor writes_                          |

---

## Phase 4 — Drag & Drop

| ID  | Task                                                 | Status | Notes                    |
| --- | ---------------------------------------------------- | ------ | ------------------------ |
| 4.1 | Set up `@dnd-kit/core` DndContext in `CalendarShell` | ⬜     |                          |
| 4.2 | Make `EventCard` draggable (`useDraggable`)          | ⬜     |                          |
| 4.3 | Build `EventDragOverlay` (drag preview)              | ⬜     |                          |
| 4.4 | Make calendar cells drop targets (`useDroppable`)    | ⬜     | Month + Week + Day views |
| 4.5 | Implement `useDragDrop` hook (drop handler logic)    | ⬜     | Updates event date/time  |
| 4.6 | Handle drag of recurring events (this/all/following) | ⬜     |                          |
| 4.7 | Write drag & drop integration tests                  | ⬜     | _Supervisor writes_      |

---

## Phase 5 — Persistence Layer

| ID   | Task                                                  | Status | Notes                                   |
| ---- | ----------------------------------------------------- | ------ | --------------------------------------- |
| 5.1  | Implement `IStorageAdapter` interface                 | ⬜     | See ADR-002                             |
| 5.2  | Implement `localStorageAdapter`                       | ⬜     | Serialise/deserialise via event schema  |
| 5.3  | Set up Firebase SDK (`firebaseConfig.ts`)             | ⬜     |                                         |
| 5.4  | Implement `firestoreAdapter`                          | ⬜     | CRUD operations                         |
| 5.5  | Implement `syncManager` (local-first sync)            | ⬜     | Optimistic updates + queue              |
| 5.6  | Handle offline mode (queue writes, sync on reconnect) | ⬜     |                                         |
| 5.7  | Wire `eventStore` to use `syncManager`                | ⬜     |                                         |
| 5.8  | Write `localStorageAdapter` unit tests                | ⬜     | _Supervisor writes_                     |
| 5.9  | Write `firestoreAdapter` integration tests            | ⬜     | _Supervisor writes_ — Firebase emulator |
| 5.10 | Write `syncManager` integration tests                 | ⬜     | _Supervisor writes_                     |

---

## Phase 6 — AI Assistant

| ID   | Task                                                   | Status | Notes                   |
| ---- | ------------------------------------------------------ | ------ | ----------------------- |
| 6.1  | Define `AIBreakdownResult` Zod schema (`ai.schema.ts`) | ⬜     | See ADR-003             |
| 6.2  | Implement `IAIService` interface                       | ⬜     |                         |
| 6.3  | Implement `anthropicService` (Claude API + tool use)   | ⬜     | See ADR-003             |
| 6.4  | Implement `ollamaService` (local fallback)             | ⬜     | Optional                |
| 6.5  | Implement `aiStore` (Zustand)                          | ⬜     |                         |
| 6.6  | Implement `useAI` hook                                 | ⬜     |                         |
| 6.7  | Build `AIAssistantPanel` (sidebar chat UI)             | ⬜     |                         |
| 6.8  | Build `AIMessageBubble` component                      | ⬜     |                         |
| 6.9  | Build `AIScheduleSuggestion` (accept/edit/dismiss)     | ⬜     |                         |
| 6.10 | Wire: accept suggestion → create events on calendar    | ⬜     |                         |
| 6.11 | Handle missing API key gracefully                      | ⬜     | Show setup instructions |
| 6.12 | Write AI service unit tests (MSW mocked)               | ⬜     | _Supervisor writes_     |
| 6.13 | Write AI UI integration tests                          | ⬜     | _Supervisor writes_     |

---

## Phase 7 — Polish & QA

| ID   | Task                                                  | Status | Notes                |
| ---- | ----------------------------------------------------- | ------ | -------------------- |
| 7.1  | Responsive design audit + fixes (mobile breakpoints)  | ⬜     |                      |
| 7.2  | ARIA labels on all interactive elements               | ⬜     |                      |
| 7.3  | Keyboard navigation (Tab, Enter, Escape, arrow keys)  | ⬜     |                      |
| 7.4  | Add `ErrorBoundary` around major sections             | ⬜     |                      |
| 7.5  | Loading skeleton states (events loading, AI thinking) | ⬜     |                      |
| 7.6  | E2E tests: create event flow                          | ⬜     | _Supervisor writes_  |
| 7.7  | E2E tests: AI breakdown + schedule flow               | ⬜     | _Supervisor writes_  |
| 7.8  | E2E tests: drag & drop rescheduling                   | ⬜     | _Supervisor writes_  |
| 7.9  | Performance audit (Lighthouse, bundle size)           | ⬜     | _Supervisor runs_    |
| 7.10 | Final code review                                     | ⬜     | _Supervisor reviews_ |
