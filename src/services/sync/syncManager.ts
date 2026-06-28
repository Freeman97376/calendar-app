import { EventSchema } from '../../domain/schemas/event.schema'
import type { DateRange, Event } from '../../domain/types'
import type { IStorageAdapter } from '../storage/IStorageAdapter'

export type PendingOperation =
  | { type: 'save'; event: Event }
  | { type: 'update'; event: Event }
  | { type: 'delete'; id: string }

type SyncManagerOptions = {
  isOnline?: () => boolean
  queueKey?: string
  queueStorage?: Storage
}

const defaultQueueKey = 'calendar_sync_queue'

function isRemoteNewer(local: Event, remote: Event): boolean {
  return new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()
}

function parseQueue(raw: string | null): PendingOperation[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as PendingOperation[]
    return parsed.map((operation) => {
      if (operation.type === 'delete') return operation
      return { ...operation, event: EventSchema.parse(operation.event) }
    })
  } catch {
    return []
  }
}

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export class SyncManager {
  private readonly isOnline: () => boolean
  private readonly queueKey: string
  private readonly queueStorage: Storage | null
  private memoryQueue: PendingOperation[] = []

  constructor(
    private readonly local: IStorageAdapter,
    private readonly remote: IStorageAdapter,
    options: SyncManagerOptions = {},
  ) {
    this.isOnline = options.isOnline ?? defaultIsOnline
    this.queueKey = options.queueKey ?? defaultQueueKey
    this.queueStorage = options.queueStorage ?? globalThis.localStorage ?? null
  }

  async getEvents(range: DateRange): Promise<Event[]> {
    const events = await this.local.getEvents(range)

    if (this.isOnline()) {
      this.syncRemoteRange(range).catch(() => undefined)
    }

    return events
  }

  async getEvent(id: string): Promise<Event | null> {
    return this.local.getEvent(id)
  }

  async saveEvent(event: Event): Promise<void> {
    const parsed = EventSchema.parse(event)
    await this.local.saveEvent(parsed)
    await this.tryRemoteOperation({ type: 'save', event: parsed })
  }

  async updateEvent(event: Event): Promise<void> {
    const parsed = EventSchema.parse(event)
    await this.local.updateEvent(parsed)
    await this.tryRemoteOperation({ type: 'update', event: parsed })
  }

  async deleteEvent(id: string): Promise<void> {
    await this.local.deleteEvent(id)
    await this.tryRemoteOperation({ type: 'delete', id })
  }

  async clear(): Promise<void> {
    await this.local.clear()
    this.writeQueue([])

    if (this.isOnline()) {
      await this.remote.clear()
    }
  }

  getPendingOperations(): PendingOperation[] {
    return this.readQueue()
  }

  attachOnlineListener(target: Pick<Window, 'addEventListener'> = window): void {
    target.addEventListener('online', () => {
      this.flushQueue().catch(() => undefined)
    })
  }

  async flushQueue(): Promise<void> {
    if (!this.isOnline()) return

    const queue = this.readQueue()
    const remaining: PendingOperation[] = []

    for (const operation of queue) {
      try {
        await this.applyRemoteOperation(operation)
      } catch {
        remaining.push(operation, ...queue.slice(queue.indexOf(operation) + 1))
        break
      }
    }

    this.writeQueue(remaining)
  }

  private async tryRemoteOperation(operation: PendingOperation): Promise<void> {
    if (!this.isOnline()) {
      this.enqueue(operation)
      return
    }

    try {
      await this.applyRemoteOperation(operation)
    } catch {
      this.enqueue(operation)
    }
  }

  private async applyRemoteOperation(operation: PendingOperation): Promise<void> {
    if (operation.type === 'delete') {
      await this.remote.deleteEvent(operation.id)
      return
    }

    await this.writeRemoteEvent(EventSchema.parse(operation.event))
  }

  private async writeRemoteEvent(event: Event): Promise<void> {
    const remoteEvent = await this.remote.getEvent(event.id)

    if (!remoteEvent) {
      await this.remote.saveEvent(event)
      return
    }

    if (isRemoteNewer(event, remoteEvent)) {
      await this.local.updateEvent(remoteEvent)
      return
    }

    await this.remote.updateEvent(event)
  }

  private async syncRemoteRange(range: DateRange): Promise<void> {
    const remoteEvents = await this.remote.getEvents(range)

    await Promise.all(
      remoteEvents.map(async (remoteEvent) => {
        const localEvent = await this.local.getEvent(remoteEvent.id)

        if (!localEvent) {
          await this.local.saveEvent(remoteEvent)
          return
        }

        if (isRemoteNewer(localEvent, remoteEvent)) {
          await this.local.updateEvent(remoteEvent)
        }
      }),
    )
  }

  private enqueue(operation: PendingOperation): void {
    this.writeQueue([...this.readQueue(), operation])
  }

  private readQueue(): PendingOperation[] {
    if (!this.queueStorage) return this.memoryQueue

    return parseQueue(this.queueStorage.getItem(this.queueKey))
  }

  private writeQueue(queue: PendingOperation[]): void {
    if (!this.queueStorage) {
      this.memoryQueue = queue
      return
    }

    this.queueStorage.setItem(this.queueKey, JSON.stringify(queue))
  }
}
