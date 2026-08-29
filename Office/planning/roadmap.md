# 🗺️ Project Roadmap — Calendar App

> Maintained by: Claude Code | Last updated: 2026-05-24

> Historical roadmap: these original phases have been superseded by the current
> implementation. The application now includes calendar CRUD and recurrence,
> FastAPI persistence, manual server accounts, AI planning, Goal Control, Fridge,
> and a Tauri desktop runtime. Use `Office/tasks/active-sprint.md`,
> `Office/test/CURRENT_STATUS.md`, and `Office/planning/architecture.md` for
> current scope and status. The phase detail below remains as project history.

---

## Next Iteration Discovery - Piecewise Checkpoint

> Mode: `/piecewise` finalized on 2026-08-19
> Started: 2026-08-19
> Scope: product-function inventory, user-experience alignment, and next-iteration direction; implementation has not started.
> Handoff: [Active Tool UX next-iteration implementation handoff](active-tool-ux-iteration-handoff.md)

### Confirmed

- The next-iteration discussion must start from the current product rather than the historical phase table below.
- Existing runtime boundaries remain fixed: Server uses MySQL with administrator-provisioned accounts and no public registration; Desktop is a login-free local SQLite build with no implicit cloud synchronization.
- Calendar changes proposed by AI or Active Tools remain preview-only until the user reviews and applies them.
- The next iteration will prioritize Tool Template / Active Tool workflow clarity: template activation, Active Tool onboarding, routing, review, and continued use form the selected product direction.
- The default Active Tool creation entry is AI Assistant: the user describes a need in natural language, the app recommends a matching template, and the Template Library remains a secondary browsing/manual-selection path.
- Immediately after template matching, the app must present a reviewable initial plan before creating the Active Tool; it must not open an empty workspace or write a calendar draft at this stage.
- After the user approves the initial plan, the app creates the Active Tool and opens its workspace automatically; calendar changes continue to require their separate review/apply step.
- The Active Tool workspace home combines current status/next recommended actions with the complete plan/dashboard; the ongoing AI conversation is a secondary surface rather than the primary home view.
- The combined Active Tool workspace uses a confirmed top-down hierarchy: a compact current-status and next-actions summary appears first, followed by the complete plan/dashboard through progressive disclosure.
- Returning users see a resume summary first, covering due/overdue actions, pending Check-ins or approvals, blockers, and changes since the previous visit.
- The primary success measure is the no-abandonment completion rate from a natural-language request through template recommendation and initial-plan approval to an opened Active Tool workspace.
- The first delivery increment covers Goal Planner and Fitness AI as representative templates; the remaining templates are deferred until the shared flow is validated.
- Goal Planner and Fitness AI use a shared core initial-plan structure with template-specific sections rather than one generic plan or two unrelated experiences.
- Before approval, users can revise the same initial-plan draft through both direct structured-field edits and natural-language AI revision requests.
- The shared core initial plan contains the intended outcome, assumptions or missing information, Milestones, initial Actions, constraints or risks, and a review cadence; deeper control fields remain template-specific or deferred.
- Template-specific details are extracted from the user's request first; the app then asks only one to three high-impact questions for information that is still missing.
- Optional missing details may be skipped with a visible confidence/accuracy-impact warning, but safety-critical constraints require explicit confirmation and are never silently inferred.
- The first increment preserves the existing separate calendar-draft review/apply flow without redesigning it; calendar application is not required during the new activation journey.
- A successful activation is recorded only after the initial plan is approved, the Active Tool is durably created, and its workspace opens successfully; calendar application is not part of this metric.
- The first increment instruments each activation step and establishes a real completion-rate baseline before any numeric target is set.
- Chinese and English copy is made consistent across the touched AI Assistant, plan-review, and Active Tool workspace surfaces; a full-app localization sweep is deferred.
- The first increment explicitly defers the remaining templates, calendar-draft redesign, full-app localization, advanced Goal Control additions, interoperability/reminders, mobile/shared-calendar work, and any numeric activation target until baseline evidence exists.

### Current Functional Inventory

1. **Calendar execution:** Month, Week, and Day views; event CRUD; recurring-event scopes; drag-and-drop rescheduling; event/task types; timezone-aware scheduling.
2. **Task management:** priority, ETA, energy, due date, notes, long-project linkage, step-level completion/editing, AI refinement, and scheduling into the calendar.
3. **AI assistance:** chat, goal breakdown, action planning, calendar/todo context switches, visible provider/model state, Active Tool routing, and a human approval boundary before writes.
4. **Long-term goal control:** recoverable goal conversation, goals/projects, metrics, Milestones, Actions, dependencies, capacity policy, Check-ins, periodic review, AI change proposals, plan versions, and rollback.
5. **Tool lifecycle:** reusable Tool Templates become independent Active Tools with aliases, routing signals, implementation paths, progress, tool runs, and calendar-draft review. Current templates include Tool Sessions, Fitness AI, Agent Learning, SEO Learning, Fridge, and Goal Planner.
6. **Fridge workflow:** receipt OCR/analysis, shelf-life estimates, per-user inventory, and reminder suggestions that can become all-day calendar events.
7. **Data and runtime operations:** manual server login, login-free desktop bootstrap, versioned backup preview/import/export, desktop update flow, AI usage/budget controls, event/task type settings, and workspace layout controls.

### UX Findings to Validate

- The product has several capable planning surfaces, but the primary user journey is not obvious: AI Assistant, Todos, Goal Planner, Active Tools, and Goal Control can all appear to be the place where planning starts or continues.
- The Workspace home is mainly a feature switcher. It explains where features live, but not what the user should do next today.
- Tool Templates and Active Tools have a sound parent-instance model, yet this model adds vocabulary and setup cost before the user receives value.
- The approval boundaries are a strong trust feature, but plan approval, calendar-draft approval, and AI change-proposal approval are separate experiences that may feel fragmented.
- Chinese localization is visibly incomplete in several planning and Goal Control surfaces, increasing cognitive load for Chinese-first users.

### Directions Considered

1. **Unified execution loop:** make `long-term goal -> this week's actions -> today's calendar -> Check-in -> adjustment` the product's main journey and next-action surface.
2. **Calendar utility expansion:** prioritize `.ics` interoperability plus reminders/notification delivery, making the app immediately useful alongside an existing calendar.
3. **Tool platform clarity - selected:** simplify template activation, Active Tool onboarding, routing, and review so specialized workflows become the main differentiator.
4. **Release confidence:** finish real-MySQL concurrency gates and packaged Windows recovery smoke before expanding product scope.

### Working Assumption

- None at the product-framework level.

### TBD After Evidence

- Numeric activation-completion target, after a real funnel baseline is collected.
- Rollout order for the remaining templates, after Goal Planner and Fitness AI validate the shared flow.

### Next Unanswered Question

- None. Discovery is finalized; implementation has not started.

---

## Timeline Overview

| Phase | Name              | Status         | Target   |
| ----- | ----------------- | -------------- | -------- |
| **0** | Bootstrap         | ⬜ Not started | Week 1   |
| **1** | Calendar Views    | ⬜ Not started | Week 2   |
| **2** | Event CRUD        | ⬜ Not started | Week 3   |
| **3** | Recurring Events  | ⬜ Not started | Week 4   |
| **4** | Drag & Drop       | ⬜ Not started | Week 5   |
| **5** | Persistence Layer | ⬜ Not started | Week 6–7 |
| **6** | AI Assistant      | ⬜ Not started | Week 8–9 |
| **7** | Polish & QA       | ⬜ Not started | Week 10  |

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

| Date       | Milestone                                  |
| ---------- | ------------------------------------------ |
| 2026-05-24 | Project kickoff — office structure created |

_(append entries as milestones are hit)_
