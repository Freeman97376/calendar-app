import { beforeEach, describe, expect, it } from 'vitest'

import type { Event } from '../../../src/domain/types'
import { LocalStorageAdapter } from '../../../src/services/storage/localStorageAdapter'

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

const range = {
  start: '2026-05-25T00:00:00.000Z',
  end: '2026-05-25T23:59:59.999Z',
}

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter

  beforeEach(() => {
    localStorage.clear()
    adapter = new LocalStorageAdapter(localStorage, 'test_calendar_events')
  })

  it('saveEvent persists an event', async () => {
    await adapter.saveEvent(baseEvent)

    await expect(adapter.getEvent(baseEvent.id)).resolves.toEqual(baseEvent)
  })

  it('saveEvent rejects duplicate ids', async () => {
    await adapter.saveEvent(baseEvent)

    await expect(adapter.saveEvent(baseEvent)).rejects.toThrow('Event already exists')
  })

  it('getEvents returns events within the given date range', async () => {
    await adapter.saveEvent(baseEvent)

    await expect(adapter.getEvents(range)).resolves.toEqual([baseEvent])
  })

  it('getEvents excludes non-recurring events outside the range', async () => {
    await adapter.saveEvent({
      ...baseEvent,
      id: 'event-2',
      startAt: '2026-06-01T16:00:00.000Z',
      endAt: '2026-06-01T17:00:00.000Z',
    })

    await expect(adapter.getEvents(range)).resolves.toEqual([])
  })

  it('getEvent returns null for unknown id', async () => {
    await expect(adapter.getEvent('missing')).resolves.toBeNull()
  })

  it('updateEvent overwrites the existing event', async () => {
    await adapter.saveEvent(baseEvent)
    await adapter.updateEvent({ ...baseEvent, title: 'Updated planning session' })

    await expect(adapter.getEvent(baseEvent.id)).resolves.toMatchObject({
      title: 'Updated planning session',
    })
  })

  it('updateEvent rejects unknown ids', async () => {
    await expect(adapter.updateEvent(baseEvent)).rejects.toThrow('Event not found')
  })

  it('deleteEvent removes the event', async () => {
    await adapter.saveEvent(baseEvent)
    await adapter.deleteEvent(baseEvent.id)

    await expect(adapter.getEvent(baseEvent.id)).resolves.toBeNull()
  })

  it('deleteEvent is a no-op for unknown id', async () => {
    await expect(adapter.deleteEvent('missing')).resolves.toBeUndefined()
  })

  it('clear removes all events', async () => {
    await adapter.saveEvent(baseEvent)
    await adapter.clear()

    await expect(adapter.getEvents(range)).resolves.toEqual([])
  })

  it('data survives serialization/deserialization round-trip', async () => {
    await adapter.saveEvent({
      ...baseEvent,
      recurrenceRule: {
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: ['mon'],
        endCondition: { type: 'count', occurrences: 2 },
      },
    })

    const freshAdapter = new LocalStorageAdapter(localStorage, 'test_calendar_events')

    await expect(freshAdapter.getEvent(baseEvent.id)).resolves.toMatchObject({
      recurrenceRule: {
        frequency: 'weekly',
        daysOfWeek: ['mon'],
      },
    })
  })
})
