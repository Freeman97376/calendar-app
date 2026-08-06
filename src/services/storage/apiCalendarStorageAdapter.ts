import { EventSchema } from '../../domain/schemas/event.schema'
import type { DateRange, Event } from '../../domain/types'
import type { CalendarApiClient } from '../calendarApiClient'
import type { IStorageAdapter } from './IStorageAdapter'

function eventCreateDto(event: Event) {
  return EventSchema.parse(event)
}

function eventUpdateDto(event: Event) {
  const parsed = EventSchema.parse(event)
  const { createdAt: _createdAt, id, ...changes } = parsed
  return {
    changes,
    id,
  }
}

export class ApiCalendarStorageAdapter implements IStorageAdapter {
  constructor(private readonly client: CalendarApiClient) {}

  async getEvents(range: DateRange): Promise<Event[]> {
    const params = new URLSearchParams({ end: range.end, start: range.start })
    const response = await this.client.get<{ success: true; events: unknown[] }>(
      `/api/calendar/events?${params.toString()}`,
    )
    return EventSchema.array().parse(response.events)
  }

  async getEvent(id: string): Promise<Event | null> {
    const events = await this.getEvents({
      end: '9999-12-31T23:59:59.999Z',
      start: '0001-01-01T00:00:00.000Z',
    })
    return events.find((event) => event.id === id) ?? null
  }

  async saveEvent(event: Event): Promise<void> {
    const response = await this.client.post<{ success: true; event: unknown }>(
      '/api/calendar/events',
      eventCreateDto(event),
    )
    EventSchema.parse(response.event)
  }

  async updateEvent(event: Event): Promise<void> {
    const dto = eventUpdateDto(event)
    const response = await this.client.patch<{ success: true; event: unknown }>(
      `/api/calendar/events/${dto.id}`,
      dto.changes,
    )
    EventSchema.parse(response.event)
  }

  async deleteEvent(id: string): Promise<void> {
    await this.client.delete<{ success: true; deleted: true }>(`/api/calendar/events/${id}`)
  }

  async clear(): Promise<void> {
    throw new Error('Calendar API clear is intentionally not supported.')
  }
}
