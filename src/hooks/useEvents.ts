import { useEffect, useMemo, useState } from 'react'

import { toISODate } from '../domain/logic/dateHelpers'
import { getEventsInRange, groupEventsByDate, type EventDraft } from '../domain/logic/eventUtils'
import type { DateRange, Event, RecurrenceRule } from '../domain/types'
import { type RecurrenceEditScope, useEventStore } from '../store/eventStore'
import { useUIStore } from '../store/uiStore'

export type { RecurrenceEditScope } from '../store/eventStore'

export type EventFormValues = {
  title: string
  description?: string
  displayDetails?: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  color?: string
  eventTypeId: string
  recurrenceRule?: RecurrenceRule
  recurrenceScope?: RecurrenceEditScope
}

function toDateTimeISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

function toEventDraft(values: EventFormValues): EventDraft {
  return {
    title: values.title,
    description: values.description,
    displayDetails: values.displayDetails,
    startAt: toDateTimeISO(values.date, values.allDay ? '00:00' : values.startTime),
    endAt: toDateTimeISO(values.date, values.allDay ? '23:59' : values.endTime),
    allDay: values.allDay,
    color: values.color,
    eventTypeId: values.eventTypeId,
    recurrenceRule: values.recurrenceRule,
  }
}

function timeRangeForHour(hour: number): { startTime: string; endTime: string } {
  const startTime = `${String(hour).padStart(2, '0')}:00`
  const endTime = hour === 23 ? '23:59' : `${String(hour + 1).padStart(2, '0')}:00`

  return { startTime, endTime }
}

export function useEvents(range?: DateRange) {
  const [sessionRefresh, setSessionRefresh] = useState(0)
  const events = useEventStore((state) => state.events)
  const isLoading = useEventStore((state) => state.isLoading)
  const error = useEventStore((state) => state.error)
  const createEvent = useEventStore((state) => state.createEvent)
  const updateEvent = useEventStore((state) => state.updateEvent)
  const deleteEvent = useEventStore((state) => state.deleteEvent)
  const loadEvents = useEventStore((state) => state.loadEvents)

  const eventModalOpen = useUIStore((state) => state.eventModalOpen)
  const editingEventId = useUIStore((state) => state.editingEventId)
  const editingEventSnapshot = useUIStore((state) => state.editingEventSnapshot)
  const selectedDate = useUIStore((state) => state.selectedDate)
  const selectedEndTime = useUIStore((state) => state.selectedEndTime)
  const selectedStartTime = useUIStore((state) => state.selectedStartTime)
  const openCreateEventModal = useUIStore((state) => state.openCreateEventModal)
  const openEditEventModal = useUIStore((state) => state.openEditEventModal)
  const closeEventModal = useUIStore((state) => state.closeEventModal)

  useEffect(() => {
    const refresh = () => setSessionRefresh((value) => value + 1)
    window.addEventListener('calendar:session-restored', refresh)
    return () => {
      window.removeEventListener('calendar:session-restored', refresh)
    }
  }, [])

  useEffect(() => {
    if (!range) return

    loadEvents(range).catch(() => undefined)
  }, [loadEvents, range, sessionRefresh])

  const visibleEvents = useMemo(() => {
    if (!range) return events
    return getEventsInRange(events, range)
  }, [events, range])

  const eventsByDate = useMemo(() => groupEventsByDate(visibleEvents), [visibleEvents])
  const editingEvent = useMemo(() => {
    return (
      editingEventSnapshot ??
      visibleEvents.find((event) => event.id === editingEventId) ??
      events.find((event) => event.id === editingEventId) ??
      null
    )
  }, [editingEventId, editingEventSnapshot, events, visibleEvents])

  async function saveEvent(values: EventFormValues) {
    const draft = toEventDraft(values)

    if (editingEvent) {
      const isRecurringEdit = Boolean(editingEvent.recurrenceRule || editingEvent.masterId)
      await updateEvent(editingEvent.id, draft, {
        recurrenceScope: isRecurringEdit ? (values.recurrenceScope ?? 'all') : undefined,
        masterId: editingEvent.masterId ?? editingEvent.id,
        occurrenceDate: toISODate(new Date(editingEvent.startAt)),
      })
    } else {
      await createEvent(draft)
    }

    closeEventModal()
  }

  async function deleteEditingEvent(recurrenceScope: RecurrenceEditScope = 'this') {
    if (!editingEvent) return

    const isRecurringEdit = Boolean(editingEvent.recurrenceRule || editingEvent.masterId)
    await deleteEvent(editingEvent.id, {
      recurrenceScope: isRecurringEdit ? recurrenceScope : undefined,
      masterId: editingEvent.masterId ?? editingEvent.id,
      occurrenceDate: toISODate(new Date(editingEvent.startAt)),
    })
    closeEventModal()
  }

  return {
    events,
    visibleEvents,
    eventsByDate,
    isLoading,
    error,
    eventModalOpen,
    editingEvent,
    selectedDate,
    selectedEndTime,
    selectedStartTime,
    openCreateEvent: openCreateEventModal,
    openCreateEventAtHour: (isoDate: string, hour: number) =>
      openCreateEventModal(isoDate, timeRangeForHour(hour)),
    openEditEvent: (event: Event) => openEditEventModal(event.id, event),
    closeEventModal,
    saveEvent,
    deleteEditingEvent,
  }
}
