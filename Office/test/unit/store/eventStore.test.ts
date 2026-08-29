import { beforeEach, describe, expect, it } from 'vitest'

import type { DateRange, Event } from '../../../../src/domain/types'
import {
  configureEventSync,
  type EventSyncManager,
  useEventStore,
} from '../../../../src/store/eventStore'

const eventDraft = {
  title: 'Planning session',
  description: 'Draft the calendar workflow.',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T17:00:00.000Z',
  color: '#047857',
}

const mayRange = {
  start: '2026-05-25T00:00:00.000Z',
  end: '2026-05-25T23:59:59.999Z',
}

const juneRange = {
  start: '2026-06-01T00:00:00.000Z',
  end: '2026-06-01T23:59:59.999Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolver, rejecter) => {
    resolve = resolver
    reject = rejecter
  })

  return { promise, reject, resolve }
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
    await expect(
      useEventStore.getState().createEvent({ ...eventDraft, title: '' }),
    ).rejects.toThrow()
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
    await expect(
      useEventStore.getState().createEvent({ ...eventDraft, title: '' }),
    ).rejects.toThrow()

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

  it('keeps the latest range when loadEvents resolves out of order', async () => {
    const mayEvent = await useEventStore.getState().createEvent(eventDraft)
    const juneEvent = await useEventStore.getState().createEvent({
      ...eventDraft,
      startAt: '2026-06-01T16:00:00.000Z',
      endAt: '2026-06-01T17:00:00.000Z',
    })
    useEventStore.getState().reset()
    const first = deferred<Event[]>()
    const second = deferred<Event[]>()
    let requestCount = 0
    configureEventSync({
      async deleteEvent() {},
      async getEvents() {
        requestCount += 1
        return requestCount === 1 ? first.promise : second.promise
      },
      async saveEvent() {},
      async updateEvent() {},
    })

    const firstLoad = useEventStore.getState().loadEvents(mayRange)
    const secondLoad = useEventStore.getState().loadEvents(juneRange)
    second.resolve([juneEvent])
    await secondLoad
    first.resolve([mayEvent])
    await firstLoad

    expect(useEventStore.getState()).toMatchObject({
      events: [juneEvent],
      error: null,
      isLoading: false,
    })
  })

  it('does not commit a pending load after reset', async () => {
    const staleEvent = await useEventStore.getState().createEvent(eventDraft)
    useEventStore.getState().reset()
    const request = deferred<Event[]>()
    configureEventSync({
      async deleteEvent() {},
      async getEvents() {
        return request.promise
      },
      async saveEvent() {},
      async updateEvent() {},
    })

    const load = useEventStore.getState().loadEvents(mayRange)
    useEventStore.getState().reset()
    request.resolve([staleEvent])
    await load

    expect(useEventStore.getState().events).toEqual([])
  })

  it('does not commit a pending load after the sync manager changes', async () => {
    const staleEvent = await useEventStore.getState().createEvent(eventDraft)
    useEventStore.getState().reset()
    const request = deferred<Event[]>()
    configureEventSync({
      async deleteEvent() {},
      async getEvents() {
        return request.promise
      },
      async saveEvent() {},
      async updateEvent() {},
    })

    const load = useEventStore.getState().loadEvents(mayRange)
    configureEventSync(new TestSyncManager())
    request.resolve([staleEvent])
    await load

    expect(useEventStore.getState().events).toEqual([])
  })

  it('does not let a pending load overwrite an event created after the load started', async () => {
    const request = deferred<Event[]>()
    configureEventSync({
      async deleteEvent() {},
      async getEvents() {
        return request.promise
      },
      async saveEvent() {},
      async updateEvent() {},
    })

    const load = useEventStore.getState().loadEvents(mayRange)
    const created = await useEventStore.getState().createEvent(eventDraft)
    request.resolve([])
    await load

    expect(useEventStore.getState()).toMatchObject({
      events: [created],
      error: null,
      isLoading: false,
    })
  })

  it('suppresses an obsolete range failure after a newer load succeeds', async () => {
    const latestEvent = await useEventStore.getState().createEvent({
      ...eventDraft,
      startAt: '2026-06-01T16:00:00.000Z',
      endAt: '2026-06-01T17:00:00.000Z',
    })
    useEventStore.getState().reset()
    const first = deferred<Event[]>()
    const second = deferred<Event[]>()
    let requestCount = 0
    configureEventSync({
      async deleteEvent() {},
      async getEvents() {
        requestCount += 1
        return requestCount === 1 ? first.promise : second.promise
      },
      async saveEvent() {},
      async updateEvent() {},
    })

    const obsoleteLoad = useEventStore.getState().loadEvents(mayRange)
    const latestLoad = useEventStore.getState().loadEvents(juneRange)
    second.resolve([latestEvent])
    await latestLoad
    first.reject(new Error('obsolete request failed'))

    await expect(obsoleteLoad).resolves.toEqual([])
    expect(useEventStore.getState()).toMatchObject({
      events: [latestEvent],
      error: null,
      isLoading: false,
    })
  })

  it('createEvent writes through the configured sync manager', async () => {
    const syncManager = new TestSyncManager()
    configureEventSync(syncManager)

    const event = await useEventStore.getState().createEvent(eventDraft)

    expect(syncManager.savedEvents).toEqual([event])
  })

  it('does not keep an event when persistence fails', async () => {
    configureEventSync(new TestSyncManager([], true))

    await expect(useEventStore.getState().createEvent(eventDraft)).rejects.toThrow(
      'simulated persistence failure',
    )

    expect(useEventStore.getState().events).toEqual([])
  })
})

class TestSyncManager implements EventSyncManager {
  readonly savedEvents: Event[] = []
  readonly updatedEvents: Event[] = []
  readonly deletedIds: string[] = []

  constructor(
    private readonly events: Event[] = [],
    private readonly failWrites = false,
  ) {}

  async getEvents(_range: DateRange): Promise<Event[]> {
    return this.events
  }

  async saveEvent(event: Event): Promise<void> {
    this.savedEvents.push(event)
    if (this.failWrites) throw new Error('simulated persistence failure')
  }

  async updateEvent(event: Event): Promise<void> {
    this.updatedEvents.push(event)
    if (this.failWrites) throw new Error('simulated persistence failure')
  }

  async deleteEvent(id: string): Promise<void> {
    this.deletedIds.push(id)
    if (this.failWrites) throw new Error('simulated persistence failure')
  }
}
