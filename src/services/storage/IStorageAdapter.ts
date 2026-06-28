// src/services/storage/IStorageAdapter.ts
// Layer 2: Services — the critical abstraction for all storage backends
// ⚠️ APPROVAL REQUIRED before editing this file
// See ADR-002: office/planning/decisions/adr-002-storage-adapter-pattern.md

import type { Event, DateRange } from '../../domain/types'

/**
 * All storage backends (localStorage, Firestore, future REST API) must implement this interface.
 * The eventStore and syncManager ONLY interact with storage through this interface.
 * This ensures: testability, swappability, and clean separation of I/O from state logic.
 */
export interface IStorageAdapter {
  /** Fetch all events whose startAt falls within the given range */
  getEvents(range: DateRange): Promise<Event[]>

  /** Fetch a single event by id. Returns null if not found. */
  getEvent(id: string): Promise<Event | null>

  /** Create a new event. Throws if an event with the same id already exists. */
  saveEvent(event: Event): Promise<void>

  /** Update an existing event. Throws if the event does not exist. */
  updateEvent(event: Event): Promise<void>

  /** Delete an event by id. No-ops if the event does not exist. */
  deleteEvent(id: string): Promise<void>

  /** Remove all events. Used for testing teardown. */
  clear(): Promise<void>
}
