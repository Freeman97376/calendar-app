# ADR-004: Zustand over Redux (or React Context)

| Field | Value |
|-------|-------|
| **Date** | 2026-05-24 |
| **Status** | Accepted |
| **Deciders** | Project Supervisor (Claude Code) |

---

## Context

The app needs client-side state management for:
- Current calendar view and focused date
- The list of events (with CRUD operations)
- UI state (modals, panels, loading indicators)
- AI conversation state

Options: Redux Toolkit, Zustand, React Context + useReducer, Jotai.

## Decision

**Use Zustand with four separate stores.**

| Store | Owns |
|-------|------|
| `calendarStore` | Current view (month/week/day), focused date, navigation |
| `eventStore` | Event list, CRUD, optimistic updates, sync calls |
| `uiStore` | Modal open/close, AI panel visibility, loading/error states |
| `aiStore` | AI messages, pending breakdown result, suggestion acceptance state |

## Rationale

### Redux Toolkit rejected
- Significant boilerplate even with RTK
- Overkill for a single-developer project without complex shared state requirements
- DevTools are excellent but not needed at this scale

### React Context + useReducer rejected
- Context re-renders all consumers on every state change
- Managing subscriptions manually defeats the purpose
- Gets unwieldy with 4+ state domains

### Jotai considered but not chosen
- Atomic model is elegant but adds mental overhead for aggregate operations (e.g., "delete all events in a date range")
- Less familiar to most React developers

### Zustand chosen because
- **Minimal boilerplate:** a store is a single `create()` call
- **Selective subscriptions:** components subscribe to slices — `useEventStore(s => s.events)` does not re-render when `uiStore` changes
- **Outside React:** stores can be called from service layer code without hooks (useful in `syncManager`)
- **TypeScript-first:** full type inference with no extra config
- **Testable:** stores can be reset between tests with `store.setState(initialState)`

### Why four stores (not one)?
Mixing `uiStore` state (modal open/closed) with `eventStore` state (event list) causes every component subscribed to events to re-render when a modal opens. Four stores = four independent subscription trees = minimal re-renders.

## Consequences

- ✅ Low boilerplate, TypeScript native
- ✅ Fine-grained subscriptions prevent unnecessary re-renders
- ✅ Stores are usable outside React components
- ⚠️ No built-in DevTools (use Zustand middleware `devtools` if needed)
- ⚠️ Cross-store actions require calling both stores — document patterns for this
