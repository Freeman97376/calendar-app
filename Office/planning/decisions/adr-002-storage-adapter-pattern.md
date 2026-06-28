# ADR-002: Storage Adapter Pattern — IStorageAdapter Interface

| Field | Value |
|-------|-------|
| **Date** | 2026-05-24 |
| **Status** | Accepted |
| **Deciders** | Project Supervisor (Claude Code) |

---

## Context

The app needs two storage backends:
1. **localStorage** — offline-first, instant reads, survives page refresh
2. **Firebase Firestore** — cloud sync, real-time updates, cross-device

The `syncManager` needs to coordinate writes between them. Future extensions may add a third adapter (a custom REST API, IndexedDB, or Supabase).

The question is: should components and stores call Firebase/localStorage directly, or should all storage access go through an abstraction layer?

## Decision

**All storage access must go through the `IStorageAdapter` interface.**

```typescript
// src/services/storage/IStorageAdapter.ts
export interface IStorageAdapter {
  getEvents(range: DateRange): Promise<Event[]>
  getEvent(id: string): Promise<Event | null>
  saveEvent(event: Event): Promise<void>
  updateEvent(event: Event): Promise<void>
  deleteEvent(id: string): Promise<void>
  clear(): Promise<void>
}
```

Both `localStorageAdapter.ts` and `firestoreAdapter.ts` implement this interface. The `syncManager.ts` receives two `IStorageAdapter` instances and coordinates between them. The `eventStore` (Zustand) calls the syncManager — it never touches Firebase or localStorage directly.

## Rationale

### Without this pattern
- Components or stores import `firebase/firestore` directly
- Testing requires a live Firebase emulator or extensive module mocking
- Switching storage backends requires changes across many files
- The offline/online sync logic is scattered

### With this pattern
- Unit tests pass a `MockStorageAdapter` — no Firebase emulator needed
- Switching from Firebase to Supabase = implement one interface, change one line in the DI setup
- The sync strategy is encapsulated in `syncManager.ts` — one place to reason about
- `eventStore` is clean: it calls `adapter.saveEvent(event)`, nothing more

### Dependency Injection
The adapters are instantiated in `src/services/firebase/firebaseConfig.ts` and `src/store/eventStore.ts` wires them up. In tests, a test factory substitutes mock adapters.

## Consequences

- ✅ Testable without Firebase emulator
- ✅ Storage backend is swappable
- ✅ Sync logic is centralized
- ⚠️ Slight indirection — developers must understand the adapter pattern
- ⚠️ Interface must be kept in sync if new storage operations are needed (low risk — schema changes are rare)
