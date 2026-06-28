import { EventSchema } from '../../domain/schemas/event.schema'
import type { DateRange, Event } from '../../domain/types'
import type { IStorageAdapter } from './IStorageAdapter'

export class LocalStorageAdapter implements IStorageAdapter {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly key = 'calendar_events',
  ) {}

  async getEvents(range: DateRange): Promise<Event[]> {
    const rangeStart = new Date(range.start)
    const rangeEnd = new Date(range.end)

    return this.readAll()
      .filter((event) => {
        const startsInRange =
          new Date(event.startAt) >= rangeStart && new Date(event.startAt) <= rangeEnd
        const overlapsRange =
          new Date(event.endAt) >= rangeStart && new Date(event.startAt) <= rangeEnd

        return event.recurrenceRule ? new Date(event.startAt) <= rangeEnd : startsInRange || overlapsRange
      })
      .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
  }

  async getEvent(id: string): Promise<Event | null> {
    return this.readAll().find((event) => event.id === id) ?? null
  }

  async saveEvent(event: Event): Promise<void> {
    const events = this.readAll()

    if (events.some((candidate) => candidate.id === event.id)) {
      throw new Error(`Event already exists: ${event.id}`)
    }

    this.writeAll([...events, EventSchema.parse(event)])
  }

  async updateEvent(event: Event): Promise<void> {
    const events = this.readAll()
    const index = events.findIndex((candidate) => candidate.id === event.id)

    if (index < 0) {
      throw new Error(`Event not found: ${event.id}`)
    }

    const nextEvents = [...events]
    nextEvents[index] = EventSchema.parse(event)
    this.writeAll(nextEvents)
  }

  async deleteEvent(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((event) => event.id !== id))
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key)
  }

  private readAll(): Event[] {
    const raw = this.storage.getItem(this.key)

    if (!raw) return []

    try {
      return EventSchema.array().parse(JSON.parse(raw))
    } catch {
      return []
    }
  }

  private writeAll(events: Event[]) {
    this.storage.setItem(this.key, JSON.stringify(EventSchema.array().parse(events)))
  }
}
