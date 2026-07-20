import { compareAsc, format, isSameDay, parseISO } from 'date-fns'

import { expandRecurrence } from './recurrence'
import { EventSchema } from '../schemas/event.schema'
import type { DateRange, Event } from '../types'

export type EventDraft = {
  title: string
  description?: string
  displayDetails?: string
  startAt: string
  endAt: string
  allDay?: boolean
  color?: string
  eventTypeId?: string
  linkedTodoId?: string
  recurrenceRule?: Event['recurrenceRule']
  exceptionFor?: string
  exceptionDate?: string
  deletedOccurrences?: string[]
}

export type EventUpdate = Partial<EventDraft>

export function buildEvent(draft: EventDraft, id: string, now = new Date()): Event {
  const timestamp = now.toISOString()

  return EventSchema.parse({
    ...draft,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export function applyEventUpdate(existing: Event, changes: EventUpdate, now = new Date()): Event {
  return EventSchema.parse({
    ...existing,
    ...changes,
    updatedAt: now.toISOString(),
    syncStatus: 'pending',
  })
}

export function getEventsInRange(events: Event[], range: DateRange): Event[] {
  const rangeStart = parseISO(range.start)
  const rangeEnd = parseISO(range.end)

  return sortEventsByTime(
    events.flatMap((event) => {
      if (event.recurrenceRule && !event.masterId && !event.exceptionFor) {
        return expandRecurrence(event, event.recurrenceRule, range)
      }

      const eventStart = parseISO(event.startAt)
      const eventEnd = parseISO(event.endAt)
      const isInRange = eventEnd >= rangeStart && eventStart <= rangeEnd

      return isInRange ? [event] : []
    }),
  )
}

export function getEventsForDay(events: Event[], isoDate: string): Event[] {
  const day = parseISO(isoDate)

  return sortEventsByTime(events.filter((event) => isSameDay(parseISO(event.startAt), day)))
}

export function groupEventsByDate(events: Event[]): Record<string, Event[]> {
  return events.reduce<Record<string, Event[]>>((grouped, event) => {
    const isoDate = format(parseISO(event.startAt), 'yyyy-MM-dd')

    grouped[isoDate] = [...(grouped[isoDate] ?? []), event]
    return grouped
  }, {})
}

export function sortEventsByTime(events: Event[]): Event[] {
  return [...events].sort((left, right) =>
    compareAsc(parseISO(left.startAt), parseISO(right.startAt)),
  )
}

export function doesEventOverlap(left: Event, right: Event): boolean {
  const leftStart = parseISO(left.startAt)
  const leftEnd = parseISO(left.endAt)
  const rightStart = parseISO(right.startAt)
  const rightEnd = parseISO(right.endAt)

  return leftStart < rightEnd && rightStart < leftEnd
}
