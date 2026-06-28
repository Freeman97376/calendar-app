# 🔭 Future Extensions Backlog

> Maintained by: Claude Code | Last updated: 2026-05-24  
> Parking lot for features and extensions outside the current 7-phase scope.  
> Items here are NOT commitments — they're ideas worth preserving.

---

## Monorepo Migration (When Needed)

**Trigger:** A second app (mobile, backend) is ready to be built.

**Migration steps:** See [ADR-001](../planning/decisions/adr-001-monorepo-strategy.md) for the full plan.

```
Step 1: mkdir -p apps/web apps/mobile packages/domain packages/ui
Step 2: Move current src/, public/, vite.config.ts → apps/web/
Step 3: Move src/domain/ → packages/domain/src/
Step 4: Move src/components/ui/ → packages/ui/src/
Step 5: Add Turborepo + pnpm workspaces
Step 6: Update import paths to @calendar/domain, @calendar/ui
```

**Structural hooks already in place:**
- `src/domain/` has zero React/Firebase/Zustand imports → extractable as-is
- `src/components/ui/` has no calendar-specific logic → extractable as-is
- `IStorageAdapter` interface → new adapters slot in without touching consumers

---

## Extension Ideas

### 🟡 High Value (do soon after Phase 7)

| ID | Extension | Effort | Structural Hook |
|----|-----------|--------|----------------|
| EXT-001 | **User Authentication** (Firebase Auth) | Medium | Firebase SDK already in `services/firebase/`; `uiStore` has UI state slot |
| EXT-002 | **Multi-user sharing** (share a calendar) | Medium-High | Firestore structure supports per-user docs; add shared collection |
| EXT-003 | **Event categories/colors** | Low | Add `category` field to `Event` Zod schema + `EventForm` UI |
| EXT-004 | **Search events** | Low | Query `localStorageAdapter` + Firestore by title/description |

### 🟠 Medium Value (next major version)

| ID | Extension | Effort | Structural Hook |
|----|-----------|--------|----------------|
| EXT-005 | **React Native mobile app** | High | `src/domain/` is mobile-ready; extract to `packages/domain` |
| EXT-006 | **Browser extension** (quick event add) | Medium | `localStorageAdapter` works in extension context; add `apps/extension/` |
| EXT-007 | **Shared component library** | Medium | `src/components/ui/` → `packages/ui`; publish to npm |
| EXT-008 | **AI: natural language event creation** ("add lunch with Sam tomorrow at noon") | Medium | `anthropicService` + new Zod output schema for `EventCreate` |
| EXT-009 | **Google Calendar import/export** (iCal) | Medium | New `googleCalendarAdapter` implementing `IStorageAdapter` |

### 🔵 Lower Priority / Exploratory

| ID | Extension | Effort | Notes |
|----|-----------|--------|-------|
| EXT-010 | **Time zone support** | High | Currently assumes local TZ; add `timezone` field to events |
| EXT-011 | **AI: meeting scheduling assistant** (find free slots) | High | Requires reading calendar + availability logic |
| EXT-012 | **Node.js backend / Cloud Functions** | Medium | Domain schemas are env-agnostic; add `functions/` at root |
| EXT-013 | **Offline-first conflict CRDT** | High | Replace last-write-wins with Yjs or Automerge when multi-user is added |
| EXT-014 | **Push notifications** (browser) | Medium | Firebase Cloud Messaging integration |
| EXT-015 | **Desktop app** (Electron or Tauri) | High | Vite web app as Electron renderer; same `src/` |
| EXT-016 | **AI: meeting summary + auto-schedule follow-ups** | High | Paste meeting notes → AI extracts action items → schedule |

---

## Tech Debt Tracker

| ID | Item | Priority | Created |
|----|------|----------|---------|
| TD-001 | Anonymous userId in Phase 5 (no real auth) | High — fix in EXT-001 | 2026-05-24 |
| TD-002 | Ollama fallback has no tool-use enforcement (best-effort JSON) | Low | 2026-05-24 |
| TD-003 | Last-write-wins conflict resolution (not CRDT) | Low until multi-user | 2026-05-24 |

---

## Ideas Graveyard (Considered & Rejected)

| Idea | Why Rejected |
|------|-------------|
| Redux Toolkit for state | Too much boilerplate; Zustand is sufficient (see ADR-004) |
| Supabase instead of Firebase | Firebase chosen for simpler setup + Google ecosystem |
| Full monorepo from day one | No second app exists yet; tooling overhead not justified (see ADR-001) |
| Server-side rendering (Next.js) | Calendar is a client-heavy SPA; SSR adds complexity without benefit |
