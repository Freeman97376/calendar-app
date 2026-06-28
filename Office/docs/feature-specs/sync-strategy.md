# Feature Spec: Sync Strategy (localStorage ↔ Firestore)

> Status: Planned (Phase 5) | Last updated: 2026-05-24  
> See also: [ADR-002](../../planning/decisions/adr-002-storage-adapter-pattern.md)

---

## Goals

1. **Offline-first:** The app works fully without an internet connection
2. **Instant feedback:** UI updates immediately (optimistic updates) — no waiting for the network
3. **Sync on reconnect:** Changes made offline sync to Firestore when the connection returns
4. **No data loss:** If a sync fails, the local data is preserved and retried

---

## Architecture

```
eventStore (Zustand)
    │
    ▼
syncManager.saveEvent(event)
    │
    ├── localStorageAdapter.saveEvent(event)   ← immediate (synchronous-like)
    │                                           ← UI updates from this
    │
    └── firestoreAdapter.saveEvent(event)       ← async network call
            │
            ├── Success → done
            └── Failure → push to offlineQueue
```

---

## Offline Queue

The `syncManager` maintains an `offlineQueue: PendingOperation[]` in localStorage:

```typescript
type PendingOperation =
  | { type: 'save'; event: Event }
  | { type: 'update'; event: Event }
  | { type: 'delete'; id: string }
```

On reconnect (detected via `window.addEventListener('online', ...)`), `syncManager.flushQueue()` replays all pending operations in order against Firestore.

---

## Conflict Resolution

**Strategy: Last-write-wins on `updatedAt`**

Every event has an `updatedAt: string` (ISO datetime) field. When syncing:
1. Fetch the Firestore version of the event
2. Compare `updatedAt` timestamps
3. Whichever is newer wins (its values are written to both stores)

This is simple and correct for a single-user app. If multi-user collaboration is added later, a CRDT-based approach should replace this (tracked in `extensions/future-backlog.md`).

---

## Schema Fields for Sync

```typescript
// Added to Event schema for sync support
syncFields: z.object({
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  syncStatus: z.enum(['synced', 'pending', 'conflict']),
})
```

The `syncStatus` field drives a small indicator in `EventCard`:
- `synced` → no indicator (clean state)
- `pending` → small cloud-with-arrow icon (saving...)
- `conflict` → orange warning icon (rare — auto-resolved by last-write-wins)

---

## Firebase Firestore Structure

```
/users/{userId}/events/{eventId}   ← per-user event documents
```

Each document mirrors the `Event` schema exactly (validated on write via Zod before saving).

**Note:** User authentication (Firebase Auth) is not in Phase 5 scope. Phase 5 uses a static anonymous user ID stored in localStorage. Real auth is in the future extensions backlog.

---

## Adapter Interface Reminder

```typescript
interface IStorageAdapter {
  getEvents(range: DateRange): Promise<Event[]>
  getEvent(id: string): Promise<Event | null>
  saveEvent(event: Event): Promise<void>
  updateEvent(event: Event): Promise<void>
  deleteEvent(id: string): Promise<void>
  clear(): Promise<void>
}
```

`syncManager` receives two adapters (`local` and `remote`) and calls both. It never knows which adapter is which — just that they both implement the interface.

---

## Edge Cases

| Case | Behaviour |
|------|----------|
| User creates event offline, same ID created online by accident | Conflict resolution: newer `updatedAt` wins |
| Firestore quota exceeded | Error logged to `office/tracking/errors.md`; local data preserved; user notified |
| Very large event list (1000+ events) | `getEvents` takes a `DateRange` — never fetches all events; view window limits query |
| User clears browser data | localStorage lost; Firestore is source of truth; re-sync on next login |
