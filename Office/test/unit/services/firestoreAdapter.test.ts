import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DateRange, Event } from '../../../../src/domain/types'
import {
  FirestoreAdapter,
  type FirestoreEventClient,
} from '../../../../src/services/storage/firestoreAdapter'

const baseEvent: Event = {
  id: 'event-1',
  title: 'Planning session',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T17:00:00.000Z',
  allDay: false,
  eventTypeId: 'general',
  syncStatus: 'pending',
  createdAt: '2026-05-25T15:00:00.000Z',
  updatedAt: '2026-05-25T15:00:00.000Z',
}

const range: DateRange = {
  start: '2026-05-25T00:00:00.000Z',
  end: '2026-05-25T23:59:59.999Z',
}

function createClient(initialEvents: Event[] = []): FirestoreEventClient {
  const events = new Map(initialEvents.map((event) => [event.id, event]))

  return {
    clearEvents: vi.fn(async () => events.clear()),
    deleteEvent: vi.fn(async (id: string) => {
      events.delete(id)
    }),
    getEvent: vi.fn(async (id: string) => events.get(id) ?? null),
    getEvents: vi.fn(async () => Array.from(events.values())),
    setEvent: vi.fn(async (event: Event) => {
      events.set(event.id, event)
    }),
  }
}

describe('FirestoreAdapter', () => {
  let client: FirestoreEventClient
  let adapter: FirestoreAdapter

  beforeEach(() => {
    client = createClient()
    adapter = new FirestoreAdapter(client)
  })

  it('saveEvent writes through the Firestore client', async () => {
    await adapter.saveEvent(baseEvent)

    await expect(adapter.getEvent(baseEvent.id)).resolves.toEqual(baseEvent)
  })

  it('saveEvent rejects duplicate ids', async () => {
    client = createClient([baseEvent])
    adapter = new FirestoreAdapter(client)

    await expect(adapter.saveEvent(baseEvent)).rejects.toThrow('Event already exists')
  })

  it('getEvents returns parsed events from the client', async () => {
    client = createClient([baseEvent])
    adapter = new FirestoreAdapter(client)

    await expect(adapter.getEvents(range)).resolves.toEqual([baseEvent])
  })

  it('updateEvent overwrites existing events', async () => {
    client = createClient([baseEvent])
    adapter = new FirestoreAdapter(client)

    await adapter.updateEvent({ ...baseEvent, title: 'Updated planning session' })

    await expect(adapter.getEvent(baseEvent.id)).resolves.toMatchObject({
      title: 'Updated planning session',
    })
  })

  it('updateEvent rejects unknown ids', async () => {
    await expect(adapter.updateEvent(baseEvent)).rejects.toThrow('Event not found')
  })

  it('deleteEvent delegates to the Firestore client', async () => {
    client = createClient([baseEvent])
    adapter = new FirestoreAdapter(client)

    await adapter.deleteEvent(baseEvent.id)

    await expect(adapter.getEvent(baseEvent.id)).resolves.toBeNull()
  })

  it('clear removes all events', async () => {
    client = createClient([baseEvent])
    adapter = new FirestoreAdapter(client)

    await adapter.clear()

    await expect(adapter.getEvents(range)).resolves.toEqual([])
  })
})
