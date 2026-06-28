import { useEffect, useMemo } from 'react'

import type { EventType } from '../domain/types'
import { useEventTypeStore } from '../store/eventTypeStore'

function appliesToCalendar(eventType: EventType): boolean {
  return eventType.appliesTo === 'calendar' || eventType.appliesTo === 'both'
}

function appliesToTodo(eventType: EventType): boolean {
  return eventType.appliesTo === 'todo' || eventType.appliesTo === 'both'
}

export function useEventTypes() {
  const eventTypes = useEventTypeStore((state) => state.eventTypes)
  const error = useEventTypeStore((state) => state.error)
  const isLoading = useEventTypeStore((state) => state.isLoading)
  const archiveEventType = useEventTypeStore((state) => state.archiveEventType)
  const createEventType = useEventTypeStore((state) => state.createEventType)
  const loadEventTypes = useEventTypeStore((state) => state.loadEventTypes)
  const updateEventType = useEventTypeStore((state) => state.updateEventType)

  useEffect(() => {
    if (eventTypes.length > 0) return

    loadEventTypes().catch(() => undefined)
  }, [eventTypes.length, loadEventTypes])

  const activeEventTypes = useMemo(
    () => eventTypes.filter((eventType) => !eventType.isArchived),
    [eventTypes],
  )
  const calendarEventTypes = useMemo(
    () => activeEventTypes.filter(appliesToCalendar),
    [activeEventTypes],
  )
  const todoEventTypes = useMemo(() => activeEventTypes.filter(appliesToTodo), [activeEventTypes])
  const eventTypesById = useMemo(
    () => new Map(eventTypes.map((eventType) => [eventType.id, eventType])),
    [eventTypes],
  )

  return {
    activeEventTypes,
    archiveEventType,
    calendarEventTypes,
    createEventType,
    error,
    eventTypes,
    eventTypesById,
    isLoading,
    loadEventTypes,
    todoEventTypes,
    updateEventType,
  }
}
