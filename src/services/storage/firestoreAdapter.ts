import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'

import { EventSchema } from '../../domain/schemas/event.schema'
import type { DateRange, Event } from '../../domain/types'
import { db } from '../firebase/firebaseConfig'
import type { IStorageAdapter } from './IStorageAdapter'

export interface FirestoreEventClient {
  clearEvents(): Promise<void>
  deleteEvent(id: string): Promise<void>
  getEvent(id: string): Promise<Event | null>
  getEvents(range: DateRange): Promise<Event[]>
  setEvent(event: Event): Promise<void>
}

class UnconfiguredFirestoreEventClient implements FirestoreEventClient {
  async clearEvents(): Promise<void> {
    throw new Error('Firestore is not configured')
  }

  async deleteEvent(): Promise<void> {
    throw new Error('Firestore is not configured')
  }

  async getEvent(): Promise<Event | null> {
    throw new Error('Firestore is not configured')
  }

  async getEvents(): Promise<Event[]> {
    throw new Error('Firestore is not configured')
  }

  async setEvent(): Promise<void> {
    throw new Error('Firestore is not configured')
  }
}

export class FirebaseFirestoreEventClient implements FirestoreEventClient {
  constructor(
    private readonly firestore: Firestore,
    private readonly userId: string,
  ) {}

  async getEvents(range: DateRange): Promise<Event[]> {
    const inRangeQuery = query(
      this.eventsCollection(),
      where('startAt', '>=', range.start),
      where('startAt', '<=', range.end),
    )
    const recurringQuery = query(
      this.eventsCollection(),
      where('startAt', '<=', range.end),
      where('recurrenceRule', '!=', null),
    )
    const [inRangeSnapshot, recurringSnapshot] = await Promise.all([
      getDocs(inRangeQuery),
      getDocs(recurringQuery),
    ])
    const seen = new Set<string>()
    const events: Event[] = []

    for (const document of [...inRangeSnapshot.docs, ...recurringSnapshot.docs]) {
      if (!seen.has(document.id)) {
        seen.add(document.id)
        events.push(EventSchema.parse(document.data()))
      }
    }

    return events.sort(
      (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
    )
  }

  async getEvent(id: string): Promise<Event | null> {
    const snapshot = await getDoc(this.eventDocument(id))
    return snapshot.exists() ? EventSchema.parse(snapshot.data()) : null
  }

  async setEvent(event: Event): Promise<void> {
    await setDoc(this.eventDocument(event.id), EventSchema.parse(event))
  }

  async deleteEvent(id: string): Promise<void> {
    await deleteDoc(this.eventDocument(id))
  }

  async clearEvents(): Promise<void> {
    const snapshot = await getDocs(this.eventsCollection())
    const batch = writeBatch(this.firestore)

    snapshot.docs.forEach((document) => batch.delete(document.ref))
    await batch.commit()
  }

  private eventsCollection() {
    return collection(this.firestore, 'users', this.userId, 'events')
  }

  private eventDocument(id: string) {
    return doc(this.firestore, 'users', this.userId, 'events', id)
  }
}

function getAnonymousUserId(storage: Storage | undefined = globalThis.localStorage): string {
  const key = 'calendar_anonymous_user_id'
  const existing = storage?.getItem(key)

  if (existing) return existing

  const generated = globalThis.crypto?.randomUUID?.() ?? 'anonymous-user'
  storage?.setItem(key, generated)
  return generated
}

export class FirestoreAdapter implements IStorageAdapter {
  constructor(
    private readonly client: FirestoreEventClient = db
      ? new FirebaseFirestoreEventClient(db, getAnonymousUserId())
      : new UnconfiguredFirestoreEventClient(),
  ) {}

  async getEvents(range: DateRange): Promise<Event[]> {
    return this.client.getEvents(range)
  }

  async getEvent(id: string): Promise<Event | null> {
    return this.client.getEvent(id)
  }

  async saveEvent(event: Event): Promise<void> {
    const existing = await this.client.getEvent(event.id)

    if (existing) {
      throw new Error(`Event already exists: ${event.id}`)
    }

    await this.client.setEvent(EventSchema.parse(event))
  }

  async updateEvent(event: Event): Promise<void> {
    const existing = await this.client.getEvent(event.id)

    if (!existing) {
      throw new Error(`Event not found: ${event.id}`)
    }

    await this.client.setEvent(EventSchema.parse(event))
  }

  async deleteEvent(id: string): Promise<void> {
    await this.client.deleteEvent(id)
  }

  async clear(): Promise<void> {
    await this.client.clearEvents()
  }
}
