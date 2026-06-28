import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DateRange, Event } from '../../src/domain/types'
import type { IStorageAdapter } from '../../src/services/storage/IStorageAdapter'
import { SyncManager } from '../../src/services/sync/syncManager'

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

class MemoryStorageAdapter implements IStorageAdapter {
  readonly events = new Map<string, Event>()
  failNextWrite = false

  constructor(events: Event[] = []) {
    events.forEach((event) => this.events.set(event.id, event))
  }

  async getEvents(): Promise<Event[]> {
    return Array.from(this.events.values())
  }

  async getEvent(id: string): Promise<Event | null> {
    return this.events.get(id) ?? null
  }

  async saveEvent(event: Event): Promise<void> {
    this.failIfRequested()

    if (this.events.has(event.id)) {
      throw new Error(`Event already exists: ${event.id}`)
    }

    this.events.set(event.id, event)
  }

  async updateEvent(event: Event): Promise<void> {
    this.failIfRequested()

    if (!this.events.has(event.id)) {
      throw new Error(`Event not found: ${event.id}`)
    }

    this.events.set(event.id, event)
  }

  async deleteEvent(id: string): Promise<void> {
    this.failIfRequested()
    this.events.delete(id)
  }

  async clear(): Promise<void> {
    this.events.clear()
  }

  private failIfRequested() {
    if (!this.failNextWrite) return

    this.failNextWrite = false
    throw new Error('Remote unavailable')
  }
}

describe('SyncManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('saveEvent writes to local adapter immediately', async () => {
    const local = new MemoryStorageAdapter()
    const remote = new MemoryStorageAdapter()
    const manager = new SyncManager(local, remote, { queueKey: 'test_queue' })

    await manager.saveEvent(baseEvent)

    await expect(local.getEvent(baseEvent.id)).resolves.toEqual(baseEvent)
  })

  it('saveEvent writes to remote adapter', async () => {
    const local = new MemoryStorageAdapter()
    const remote = new MemoryStorageAdapter()
    const manager = new SyncManager(local, remote, { queueKey: 'test_queue' })

    await manager.saveEvent(baseEvent)

    await expect(remote.getEvent(baseEvent.id)).resolves.toEqual(baseEvent)
  })

  it('when remote fails, operation is queued', async () => {
    const local = new MemoryStorageAdapter()
    const remote = new MemoryStorageAdapter()
    remote.failNextWrite = true
    const manager = new SyncManager(local, remote, { queueKey: 'test_queue' })

    await manager.saveEvent(baseEvent)

    expect(manager.getPendingOperations()).toEqual([{ type: 'save', event: baseEvent }])
    await expect(local.getEvent(baseEvent.id)).resolves.toEqual(baseEvent)
  })

  it('flushQueue replays pending operations against remote', async () => {
    const local = new MemoryStorageAdapter()
    const remote = new MemoryStorageAdapter()
    remote.failNextWrite = true
    const manager = new SyncManager(local, remote, { queueKey: 'test_queue' })

    await manager.saveEvent(baseEvent)
    await manager.flushQueue()

    expect(manager.getPendingOperations()).toEqual([])
    await expect(remote.getEvent(baseEvent.id)).resolves.toEqual(baseEvent)
  })

  it('last-write-wins: newer updatedAt wins on conflict', async () => {
    const local = new MemoryStorageAdapter()
    const remoteEvent = {
      ...baseEvent,
      title: 'Remote title',
      updatedAt: '2026-05-25T16:00:00.000Z',
    }
    const remote = new MemoryStorageAdapter([remoteEvent])
    const manager = new SyncManager(local, remote, { queueKey: 'test_queue' })

    await manager.saveEvent(baseEvent)

    await expect(local.getEvent(baseEvent.id)).resolves.toEqual(remoteEvent)
    await expect(remote.getEvent(baseEvent.id)).resolves.toEqual(remoteEvent)
  })

  it('getEvents returns local events and starts remote reconciliation', async () => {
    const local = new MemoryStorageAdapter([baseEvent])
    const remote = new MemoryStorageAdapter([
      {
        ...baseEvent,
        id: 'event-2',
        title: 'Remote event',
      },
    ])
    const manager = new SyncManager(local, remote, { queueKey: 'test_queue' })

    await expect(manager.getEvents(range)).resolves.toEqual([baseEvent])

    await vi.waitFor(async () => {
      await expect(local.getEvent('event-2')).resolves.toMatchObject({ title: 'Remote event' })
    })
  })
})
