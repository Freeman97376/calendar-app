import { create } from 'zustand'

import { createDefaultEventTypeService } from '../services/eventTypes/defaultEventTypeService'
import type {
  EventTypeDraft,
  EventTypeUpdate,
  IEventTypeService,
} from '../services/eventTypes/IEventTypeService'
import type { EventType } from '../domain/types'

export type EventTypeStore = {
  eventTypes: EventType[]
  error: string | null
  isLoading: boolean
  archiveEventType: (id: string) => Promise<EventType>
  createEventType: (draft: EventTypeDraft) => Promise<EventType>
  loadEventTypes: () => Promise<EventType[]>
  reset: (eventTypes?: EventType[]) => void
  updateEventType: (id: string, changes: EventTypeUpdate) => Promise<EventType>
}

let eventTypeService: IEventTypeService | null = createDefaultEventTypeService()

export function configureEventTypeService(service: IEventTypeService | null) {
  eventTypeService = service
}

function requireEventTypeService(): IEventTypeService {
  if (!eventTypeService) {
    throw new Error('Event type service is not configured')
  }

  return eventTypeService
}

export const useEventTypeStore = create<EventTypeStore>((set) => ({
  eventTypes: [],
  error: null,
  isLoading: false,
  archiveEventType: async (id) => {
    try {
      const archived = await requireEventTypeService().archiveEventType(id)
      set((state) => ({
        eventTypes: state.eventTypes.map((eventType) =>
          eventType.id === archived.id ? archived : eventType,
        ),
        error: null,
      }))
      return archived
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to archive event type'
      set({ error: message })
      throw error
    }
  },
  createEventType: async (draft) => {
    try {
      const created = await requireEventTypeService().createEventType(draft)
      set((state) => ({ eventTypes: [...state.eventTypes, created], error: null }))
      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create event type'
      set({ error: message })
      throw error
    }
  },
  loadEventTypes: async () => {
    set({ isLoading: true, error: null })
    try {
      const eventTypes = await requireEventTypeService().getEventTypes()
      set({ eventTypes, isLoading: false })
      return eventTypes
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load event types'
      set({ error: message, isLoading: false })
      throw error
    }
  },
  reset: (eventTypes = []) => set({ eventTypes, error: null, isLoading: false }),
  updateEventType: async (id, changes) => {
    try {
      const updated = await requireEventTypeService().updateEventType(id, changes)
      set((state) => ({
        eventTypes: state.eventTypes.map((eventType) =>
          eventType.id === updated.id ? updated : eventType,
        ),
        error: null,
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update event type'
      set({ error: message })
      throw error
    }
  },
}))
