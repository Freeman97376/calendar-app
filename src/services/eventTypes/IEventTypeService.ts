import type { EventType } from '../../domain/types'

export type EventTypeDraft = {
  label: string
  color: string
  appliesTo: EventType['appliesTo']
}

export type EventTypeUpdate = Partial<EventTypeDraft> & {
  isArchived?: boolean
}

export interface IEventTypeService {
  archiveEventType(id: string): Promise<EventType>
  createEventType(draft: EventTypeDraft): Promise<EventType>
  getEventTypes(): Promise<EventType[]>
  updateEventType(id: string, changes: EventTypeUpdate): Promise<EventType>
}

