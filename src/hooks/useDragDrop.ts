import {
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { useMemo, useState } from 'react'

import type { Event } from '../domain/types'
import { type RecurrenceEditScope, useEventStore } from '../store/eventStore'

export type CalendarDropTarget =
  | {
      kind: 'date'
      isoDate: string
    }
  | {
      kind: 'time-slot'
      isoDate: string
      hour: number
    }

export type EventDragData = {
  type: 'calendar-event'
  event: Event
}

export type DropTargetData = {
  type: 'calendar-drop-target'
  target: CalendarDropTarget
}

const recurrenceScopeLabels: Record<RecurrenceEditScope, string> = {
  this: 'this',
  following: 'following',
  all: 'all',
}

function parseLocalDate(isoDate: string): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number)
  return { year, monthIndex: month - 1, day }
}

function toLocalISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function eventFromDragData(data: unknown): Event | null {
  const dragData = data as Partial<EventDragData> | undefined
  return dragData?.type === 'calendar-event' && dragData.event ? dragData.event : null
}

function targetFromDropData(data: unknown): CalendarDropTarget | null {
  const dropData = data as Partial<DropTargetData> | undefined
  return dropData?.type === 'calendar-drop-target' && dropData.target ? dropData.target : null
}

function getDropTargetDate(target: CalendarDropTarget): Date {
  const { year, monthIndex, day } = parseLocalDate(target.isoDate)

  if (target.kind === 'time-slot') {
    return new Date(year, monthIndex, day, target.hour, 0, 0, 0)
  }

  return new Date(year, monthIndex, day)
}

export function getDropTargetId(target: CalendarDropTarget): string {
  if (target.kind === 'time-slot') {
    return `time-slot:${target.isoDate}:${target.hour}`
  }

  return `date:${target.isoDate}`
}

export function getRescheduledEventUpdate(
  event: Event,
  target: CalendarDropTarget,
): { startAt: string; endAt: string } {
  const currentStart = new Date(event.startAt)
  const currentEnd = new Date(event.endAt)
  const durationMs = currentEnd.getTime() - currentStart.getTime()
  const targetDate = getDropTargetDate(target)
  const nextStart =
    target.kind === 'time-slot'
      ? targetDate
      : new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          currentStart.getHours(),
          currentStart.getMinutes(),
          currentStart.getSeconds(),
          currentStart.getMilliseconds(),
        )
  const nextEnd = new Date(nextStart.getTime() + durationMs)

  return {
    startAt: nextStart.toISOString(),
    endAt: nextEnd.toISOString(),
  }
}

export function parseRecurrenceEditScope(value: string | null): RecurrenceEditScope | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase()

  if (['this', 'this event'].includes(normalized)) return 'this'
  if (['following', 'this and following'].includes(normalized)) return 'following'
  if (['all', 'all events'].includes(normalized)) return 'all'

  return null
}

export function isRecurringDragEvent(event: Event): boolean {
  return Boolean(event.masterId || event.recurrenceRule)
}

export function getEventLocalDate(event: Event): string {
  return toLocalISODate(new Date(event.startAt))
}

export function promptForRecurrenceEditScope(): RecurrenceEditScope | null {
  const value = window.prompt(
    `Apply drag to: ${recurrenceScopeLabels.this}, ${recurrenceScopeLabels.following}, or ${recurrenceScopeLabels.all}?`,
    recurrenceScopeLabels.this,
  )

  return parseRecurrenceEditScope(value)
}

export function useDragDrop(events: Event[]) {
  const updateEvent = useEventStore((state) => state.updateEvent)
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events])
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor),
  )

  function getEventFromDrag(id: UniqueIdentifier, data: unknown): Event | null {
    return eventFromDragData(data) ?? eventsById.get(String(id)) ?? null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveEvent(getEventFromDrag(event.active.id, event.active.data.current))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const draggedEvent = getEventFromDrag(event.active.id, event.active.data.current)
    const target = targetFromDropData(event.over?.data.current)

    setActiveEvent(null)

    if (!draggedEvent || !target) return

    const changes = getRescheduledEventUpdate(draggedEvent, target)
    const recurrenceScope = isRecurringDragEvent(draggedEvent)
      ? promptForRecurrenceEditScope()
      : null

    if (isRecurringDragEvent(draggedEvent) && !recurrenceScope) return

    await updateEvent(draggedEvent.id, changes, {
      recurrenceScope: recurrenceScope ?? undefined,
      masterId: draggedEvent.masterId ?? draggedEvent.id,
      occurrenceDate: getEventLocalDate(draggedEvent),
    })
  }

  function handleDragCancel() {
    setActiveEvent(null)
  }

  return {
    activeEvent,
    handleDragCancel,
    handleDragEnd,
    handleDragStart,
    sensors,
  }
}
