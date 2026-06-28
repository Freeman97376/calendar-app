import { beforeEach, describe, expect, it } from 'vitest'

import type { DateRange, Event } from '../../../src/domain/types'
import {
  configureEventSync,
  type EventSyncManager,
  useEventStore,
} from '../../../src/store/eventStore'

const eventDraft = {
  title: 'Planning session',
  description: 'Draft the calendar workflow.',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T17:00:00.000Z',
  color: '#047857',
}

describe('eventStore', () => {
  beforeEach(() => {
    configureEventSync(null)
    useEventStore.getState().reset()
  })

  it('createEvent adds event to local state immediately', async () => {
    const event = await useEventStore.getState().createEvent(eventDraft)

    expect(useEventStore.getState().events).toContainEqual(event)
  })

  it('createEvent validates event data', async () => {
    await expect(useEventStore.getState().createEvent({ ...eventDraft, title: '' })).rejects.toThrow()
    expect(useEventStore.getState().events).toHaveLength(0)
  })

  it('updateEvent updates event in local state', async () => {
    const event = await useEventStore.getState().createEvent(eventDraft)

    await useEventStore.getState().updateEvent(event.id, { title: 'Updated planning session' })

    expect(useEventStore.getState().events[0].title).toBe('Updated planning session')
  })

  it('deleteEvent removes event from local state', async () => {
    const event = await useEventStore.getState().createEvent(eventDraft)

    await useEventStore.getState().deleteEvent(event.id)

    expect(useEventStore.getState().events).toHaveLength(0)
  })

  it('loadEvents returns events inside the given date range', async () => {
    await useEventStore.getState().createEvent(eventDraft)

    const events = await useEventStore.getState().loadEvents({
      start: '2026-05-25T00:00:00.000Z',
      end: '2026-05-25T23:59:59.999Z',
    })

    expect(events).toHaveLength(1)
  })

  it('error state is set when validation fails', async () => {
    await expect(useEventStore.getState().createEvent({ ...eventDraft, title: '' })).rejects.toThrow()

    expect(useEventStore.getState().error).toBeTruthy()
  })

  it('isLoading is false after loadEvents settles', async () => {
    await useEventStore.getState().loadEvents({
      start: '2026-05-25T00:00:00.000Z',
      end: '2026-05-25T23:59:59.999Z',
    })

    expect(useEventStore.getState().isLoading).toBe(false)
  })

  it('loadEvents hydrates state from the configured sync manager', async () => {
    const syncedEvent = await useEventStore.getState().createEvent(eventDraft)
    useEventStore.getState().reset()
    configureEventSync(new TestSyncManager([syncedEvent]))

    await useEventStore.getState().loadEvents({
      start: '2026-05-25T00:00:00.000Z',
      end: '2026-05-25T23:59:59.999Z',
    })

    expect(useEventStore.getState().events).toEqual([syncedEvent])
  })

  it('createEvent writes through the configured sync manager', async () => {
    const syncManager = new TestSyncManager()
    configureEventSync(syncManager)

    const event = await useEventStore.getState().createEvent(eventDraft)

    expect(syncManager.savedEvents).toEqual([event])
  })
})

class TestSyncManager implements EventSyncManager {
  readonly savedEvents: Event[] = []
  readonly updatedEvents: Event[] = []
  readonly deletedIds: string[] = []

  constructor(private readonly events: Event[] = []) {}

  async getEvents(_range: DateRange): Promise<Event[]> {
    return this.events
  }

  async saveEvent(event: Event): Promise<void> {
    this.savedEvents.push(event)
  }

  async updateEvent(event: Event): Promise<void> {
    this.updatedEvents.push(event)
  }

  async deleteEvent(id: string): Promise<void> {
    this.deletedIds.push(id)
  }
}
