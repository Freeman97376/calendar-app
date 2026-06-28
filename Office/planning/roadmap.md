# 🗺️ Project Roadmap — Calendar App

> Maintained by: Claude Code | Last updated: 2026-05-24

---

## Timeline Overview

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| **0** | Bootstrap | ⬜ Not started | Week 1 |
| **1** | Calendar Views | ⬜ Not started | Week 2 |
| **2** | Event CRUD | ⬜ Not started | Week 3 |
| **3** | Recurring Events | ⬜ Not started | Week 4 |
| **4** | Drag & Drop | ⬜ Not started | Week 5 |
| **5** | Persistence Layer | ⬜ Not started | Week 6–7 |
| **6** | AI Assistant | ⬜ Not started | Week 8–9 |
| **7** | Polish & QA | ⬜ Not started | Week 10 |

Status legend: ⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

## Phase Details

### Phase 0 — Bootstrap (Week 1)
**Goal:** Working dev environment with all tooling configured.

**Done when:**
- `npm run dev` launches the Vite dev server with no errors
- `npm test` runs Vitest successfully (even with 0 tests)
- ESLint and Prettier are configured and passing
- Firebase project created and `.env` populated
- Folder structure matches `office/planning/architecture.md`

**Key tasks:** See [active-sprint.md](../tasks/active-sprint.md)

---

### Phase 1 — Calendar Views (Week 2)
**Goal:** Interactive calendar with Month/Week/Day views and date navigation.

**Done when:**
- User can switch between Month, Week, and Day views
- Prev/Next/Today navigation works correctly
- All views render correctly for edge-case dates (month boundaries, leap years, DST)
- Unit tests for view logic pass

---

### Phase 2 — Event CRUD (Week 3)
**Goal:** Full create/edit/delete event lifecycle.

**Done when:**
- User can click a date/time slot to create an event
- User can click an event to edit it
- User can delete an event with confirmation
- `Event` Zod schema validates all data
- Unit + integration tests pass

---

### Phase 3 — Recurring Events (Week 4)
**Goal:** Events that repeat on a schedule.

**Done when:**
- User can set daily/weekly/monthly recurrence on any event
- "Edit this / all / following" options work
- Recurrence expansion logic handles month boundaries and year rollovers
- All recurrence unit tests pass

---

### Phase 4 — Drag & Drop (Week 5)
**Goal:** Drag events to reschedule them.

**Done when:**
- Events can be dragged to a new date in Month view
- Events can be dragged to a new time slot in Week/Day view
- Dragging a recurring event shows "change this / all / following" prompt
- Drag & drop integration tests pass

---

### Phase 5 — Persistence Layer (Week 6–7)
**Goal:** Events survive page refresh (localStorage) and sync across devices (Firestore).

**Done when:**
- Events persist in localStorage after page reload
- Events sync to Firestore when online
- Offline changes queue and sync on reconnect
- Conflict resolution strategy documented and implemented
- Adapter unit tests and sync integration tests pass

---

### Phase 6 — AI Assistant (Week 8–9)
**Goal:** User describes a goal; AI breaks it into steps and schedules them.

**Done when:**
- AI panel opens in sidebar
- User types a goal → AI returns structured step list (validated by Zod schema)
- User can accept suggestion → steps auto-schedule as calendar events
- Fallback works if API key is missing (graceful error state)
- AI service tests (MSW mocked) pass

---

### Phase 7 — Polish & QA (Week 10)
**Goal:** Production-quality app — responsive, accessible, and fully tested.

**Done when:**
- App works on mobile screen sizes
- All interactive elements have ARIA labels
- Keyboard navigation works throughout
- E2E tests cover all critical flows
- Performance: no layout shifts, no janky scrolling
- Final code review complete

---

## Milestone Dates Log

| Date | Milestone |
|------|-----------|
| 2026-05-24 | Project kickoff — office structure created |

*(append entries as milestones are hit)*
