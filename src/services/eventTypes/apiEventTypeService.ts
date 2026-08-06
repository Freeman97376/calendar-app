import { EventTypeSchema } from '../../domain/schemas/eventType.schema'
import type { EventType } from '../../domain/types'
import type { CalendarApiClient } from '../calendarApiClient'
import type { EventTypeDraft, EventTypeUpdate, IEventTypeService } from './IEventTypeService'

function createEventTypeId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || `type-${Date.now()}`
}

export class ApiEventTypeService implements IEventTypeService {
  constructor(private readonly client: CalendarApiClient) {}

  async archiveEventType(id: string): Promise<EventType> {
    return this.updateEventType(id, { isArchived: true })
  }

  async createEventType(draft: EventTypeDraft): Promise<EventType> {
    const timestamp = new Date().toISOString()
    const response = await this.client.post<{ success: true; eventType: unknown }>(
      '/api/calendar/event-types',
      {
        ...draft,
        id: createEventTypeId(draft.label),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    )
    return EventTypeSchema.parse(response.eventType)
  }

  async getEventTypes(): Promise<EventType[]> {
    const response = await this.client.get<{ success: true; eventTypes: unknown[] }>(
      '/api/calendar/event-types',
    )
    return EventTypeSchema.array().parse(response.eventTypes)
  }

  async updateEventType(id: string, changes: EventTypeUpdate): Promise<EventType> {
    const response = await this.client.patch<{ success: true; eventType: unknown }>(
      `/api/calendar/event-types/${id}`,
      changes,
    )
    return EventTypeSchema.parse(response.eventType)
  }
}
