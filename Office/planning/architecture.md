# 🏗️ Architecture — Calendar App

> Maintained by: Claude Code | Last updated: 2026-05-24

---

## Overview

The application uses a **5-layer architecture** inside `src/`. Each layer has a single responsibility and a strict import rule: **a layer may only import from layers below it**. This prevents circular dependencies and keeps the domain logic independently testable.

```
┌─────────────────────────────────┐
│  Layer 5: components/           │  React UI — presentational
├─────────────────────────────────┤
│  Layer 4: hooks/                │  React glue — async orchestration
├─────────────────────────────────┤
│  Layer 3: store/                │  Zustand — app state
├─────────────────────────────────┤
│  Layer 2: services/             │  I/O adapters — Firebase, localStorage, AI
├─────────────────────────────────┤
│  Layer 1: domain/               │  Pure — Zod schemas, logic, TypeScript types
└─────────────────────────────────┘
```

---

## Layer 1: `src/domain/` — The Zero-Dependency Core

**Rule:** May only import from `zod` and `date-fns`. No React, no Firebase, no Zustand.

**Why:** This layer contains the business logic of the calendar app. By keeping it free of framework dependencies, it can be used in:
- The React web app
- A future React Native mobile app
- A future Node.js backend or Cloud Functions
- Tests (no mocking needed — it's pure functions)

**Contents:**

| Folder | Purpose |
|--------|---------|
| `schemas/` | Zod schemas — single source of truth for all data shapes |
| `types/` | TypeScript types derived via `z.infer<>` — no duplication |
| `logic/` | Pure functions — recurrence expansion, date helpers, event utilities |

**Key files:**
- `schemas/event.schema.ts` — the `Event` Zod schema (all fields validated here)
- `schemas/recurrence.schema.ts` — RRULE-inspired recurrence rule schema
- `schemas/ai.schema.ts` — structured output schemas for AI goal breakdowns and action plans
- `schemas/toolSession.schema.ts` — Tool Session preset, request, and event-draft schemas
- `logic/toolSessionPresets/` — built-in Tool Session presets, one preset per folder
- `logic/recurrence.ts` — generates event instances from a recurrence rule
- `logic/dateHelpers.ts` — thin wrappers around date-fns for app-specific operations

---

## Layer 2: `src/services/` — I/O Adapters

**Rule:** May only import from `domain/schemas`, `domain/types`, and firebase config.

**Why:** All external I/O (network, storage, APIs) is isolated here. The rest of the app never touches Firebase or a concrete AI provider directly — it only calls interfaces. This means:
- Swapping Firebase for Supabase = write a new adapter, change nothing else
- Swapping the API provider = update `apiAIService` configuration or implement `IAIService`, change nothing else
- Testing = pass a mock adapter, no real network calls

**Key interfaces:**
```typescript
// IStorageAdapter.ts — implemented by localStorageAdapter & firestoreAdapter
interface IStorageAdapter {
  getEvents(range: DateRange): Promise<Event[]>
  saveEvent(event: Event): Promise<void>
  updateEvent(event: Event): Promise<void>
  deleteEvent(id: string): Promise<void>
}

// IAIService.ts — implemented by apiAIService & localAIService
interface IAIService {
  breakdownGoal(goal: string): Promise<AIBreakdownResult>
  planCalendarActions(command: string, context: AICalendarContext): Promise<AICalendarActionPlan>
  runToolSession(request: ToolSessionRequest): Promise<ToolSessionResult>
}
```

**Subfolders:**

| Folder | Contents |
|--------|---------|
| `storage/` | `IStorageAdapter.ts`, `localStorageAdapter.ts`, `firestoreAdapter.ts` |
| `sync/` | `syncManager.ts` — coordinates local-first sync between two adapters |
| `ai/` | `IAIService.ts`, `apiAIService.ts`, `localAIService.ts`, `fallbackAIService.ts`, `aiServiceFactory.ts` |
| `fridge/` | Frontend API adapter for the local Python fridge backend |
| `firebase/` | `firebaseConfig.ts` — Firebase SDK init only |

---

## Layer 3: `src/store/` — Zustand State

**Rule:** May only import from `services/` and `domain/types`.

**Why:** Four separate stores prevent unnecessary re-renders. Mixing UI state (modal open/closed) with data state (event list) causes every component subscribed to events to re-render when a modal opens.

| Store | Owns |
|-------|------|
| `calendarStore.ts` | Current view (month/week/day), focused date |
| `eventStore.ts` | Event list, CRUD operations, optimistic updates |
| `uiStore.ts` | Modal visibility, panel open/closed, loading states |
| `aiStore.ts` | AI conversation history, pending suggestions |

---

## Layer 4: `src/hooks/` — React Glue

**Rule:** May only import from `store/`, `domain/logic`, and `domain/types`.

**Why:** Hooks bridge Zustand state with React's lifecycle and handle async orchestration. Keeping this logic out of components keeps components thin and testable.

| Hook | Responsibility |
|------|---------------|
| `useCalendar.ts` | View switching, date navigation |
| `useEvents.ts` | CRUD operations with optimistic UI + sync |
| `useRecurrence.ts` | Expanding recurrence rules into event instances |
| `useDragDrop.ts` | dnd-kit drag state + drop handler logic |
| `useAI.ts` | AI service calls, streaming state, suggestion acceptance |

---

## Layer 5: `src/components/` — Presentation

**Rule:** May only import from `hooks/`, `domain/types`, and `components/ui/`.

**Why:** Components should be thin. They receive data via hooks and render it. Heavy logic belongs in hooks or lower layers.

**Subfolders:**

| Folder | Contains |
|--------|---------|
| `calendar/` | `CalendarShell`, `MonthView`, `WeekView`, `DayView`, `CalendarHeader`, `ViewSwitcher`, `TimeGrid` |
| `event/` | `EventCard`, `EventModal`, `EventForm`, `RecurrenceSelector`, `EventDragOverlay` |
| `ai/` | `AIAssistantPanel`, `AIMessageBubble`, `AIScheduleSuggestion` |
| `tools/` | Tools panel registry plus one folder per tool entry |
| `ui/` | `Button`, `Modal`, `Spinner`, `ErrorBoundary` — generic, zero calendar logic |

> `components/ui/` is the embryo of a future shared component library. These components must never import from calendar-specific layers.

---

## Data Flow Diagram

```
User Action
    │
    ▼
Component (components/)
    │  calls hook
    ▼
Hook (hooks/)
    │  reads/writes store
    ▼
Store (store/)
    │  calls service
    ▼
Service (services/)
    │  validates with schema, reads/writes
    ▼
Firebase Firestore  ←→  syncManager  ←→  localStorage
```

For AI flow:
```
User types goal
    │
AIAssistantPanel
    │  useAI hook
    │
IAIService.breakdownGoal(goal)
    │  apiAIService chat completions or localAIService
    │
Raw provider response
    │  Parsed + validated by ai.schema.ts (Zod)
    │
AIBreakdownResult (typed, validated)
    │
useAI.acceptSuggestion -> eventStore.createEvent
    │
Calendar updated
```

For AI action plans:
```
User command
    │
useAI.buildContext(events, todos, eventTypes)
    │
IAIService.planCalendarActions(command, context)
    │
AICalendarActionPlanSchema validation
    │
Review in AIAssistantPanel
    │
Apply Actions -> eventStore / todoStore
```

---

## Dependency List

### Runtime
```
react @18                   # UI framework
react-dom @18
zustand @5                  # state management
date-fns @4                 # date math
@dnd-kit/core               # drag and drop
@dnd-kit/sortable           # sortable lists  
zod @3                      # schema validation
firebase @11                # Firestore + Auth
zod-to-json-schema @3       # schema helper retained for compatibility work
```

### Dev
```
typescript @5
vite @6
@vitejs/plugin-react
vitest @3
@vitest/ui
@testing-library/react
@testing-library/user-event
@testing-library/jest-dom
msw @2                      # mock API in tests
eslint @9
prettier @3
tailwindcss @4
autoprefixer
postcss
```

---

## Monorepo Extraction Path

See [ADR-001](decisions/adr-001-monorepo-strategy.md) for the full decision.

**Summary:** The project starts flat (everything at root). When a second app is needed (mobile, backend), the migration is:

```
Step 1: Create apps/web/ and move current root (src/, public/, vite.config.ts, etc.) there
Step 2: Create apps/mobile/ for React Native
Step 3: Create packages/domain/ and move src/domain/ there
Step 4: Create packages/ui/ and move src/components/ui/ there
Step 5: Add Turborepo + pnpm workspaces
```

Because `src/domain/` has zero framework dependencies today, Step 3 requires only moving files — no rewrites.
