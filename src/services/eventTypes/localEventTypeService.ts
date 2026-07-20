import { EventTypeSchema } from '../../domain/schemas/eventType.schema'
import type { EventType } from '../../domain/types'
import type { EventTypeDraft, EventTypeUpdate, IEventTypeService } from './IEventTypeService'

const DEFAULT_EVENT_TYPES: EventType[] = [
  seedType('general', 'General', '#047857', 'both'),
  seedType('project', 'Project', '#2563eb', 'both'),
  seedType('deadline', 'Deadline', '#b91c1c', 'both'),
  seedType('meal', 'Meal', '#c2410c', 'calendar'),
  seedType('errand', 'Errand', '#7c3aed', 'both'),
]

function seedType(
  id: string,
  label: string,
  color: string,
  appliesTo: EventType['appliesTo'],
): EventType {
  const timestamp = '2026-01-01T00:00:00.000Z'
  return EventTypeSchema.parse({
    id,
    label,
    color,
    appliesTo,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function createEventTypeId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || `type-${Date.now()}`
}

export class LocalEventTypeService implements IEventTypeService {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly key = 'calendar_event_types',
  ) {}

  async archiveEventType(id: string): Promise<EventType> {
    return this.updateEventType(id, { isArchived: true })
  }

  async createEventType(draft: EventTypeDraft): Promise<EventType> {
    const eventTypes = this.readAll()
    const baseId = createEventTypeId(draft.label)
    let id = baseId
    let suffix = 2

    while (eventTypes.some((eventType) => eventType.id === id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }

    const timestamp = new Date().toISOString()
    const eventType = EventTypeSchema.parse({
      id,
      label: draft.label,
      color: draft.color,
      appliesTo: draft.appliesTo,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    this.writeAll([...eventTypes, eventType])
    return eventType
  }

  async getEventTypes(): Promise<EventType[]> {
    return this.readAll()
  }

  async updateEventType(id: string, changes: EventTypeUpdate): Promise<EventType> {
    const eventTypes = this.readAll()
    const index = eventTypes.findIndex((eventType) => eventType.id === id)

    if (index < 0) {
      throw new Error(`Event type not found: ${id}`)
    }

    const updated = EventTypeSchema.parse({
      ...eventTypes[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    })
    const nextEventTypes = [...eventTypes]
    nextEventTypes[index] = updated
    this.writeAll(nextEventTypes)
    return updated
  }

  private readAll(): EventType[] {
    const raw = this.storage.getItem(this.key)

    if (!raw) {
      this.writeAll(DEFAULT_EVENT_TYPES)
      return DEFAULT_EVENT_TYPES
    }

    try {
      return EventTypeSchema.array().parse(JSON.parse(raw))
    } catch {
      this.writeAll(DEFAULT_EVENT_TYPES)
      return DEFAULT_EVENT_TYPES
    }
  }

  private writeAll(eventTypes: EventType[]) {
    this.storage.setItem(this.key, JSON.stringify(EventTypeSchema.array().parse(eventTypes)))
  }
}
