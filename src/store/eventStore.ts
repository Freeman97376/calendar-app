import { create } from 'zustand'

import {
  applyEventUpdate,
  buildEvent,
  getEventsInRange,
  type EventDraft,
  type EventUpdate,
} from '../domain/logic/eventUtils'
import { expandRecurrence } from '../domain/logic/recurrence'
import type { DateRange, Event, RecurrenceRule } from '../domain/types'
import type { SyncManager } from '../services/sync/syncManager'

export type RecurrenceEditScope = 'this' | 'following' | 'all'
export type EventSyncManager = Pick<
  SyncManager,
  'deleteEvent' | 'getEvents' | 'saveEvent' | 'updateEvent'
>

export type RecurrenceMutationOptions = {
  recurrenceScope?: RecurrenceEditScope
  masterId?: string
  occurrenceDate?: string
}

export type EventStore = {
  events: Event[]
  isLoading: boolean
  error: string | null
  loadEvents: (range: DateRange) => Promise<Event[]>
  createEvent: (event: EventDraft) => Promise<Event>
  updateEvent: (
    id: string,
    changes: EventUpdate,
    options?: RecurrenceMutationOptions,
  ) => Promise<Event>
  deleteEvent: (id: string, options?: RecurrenceMutationOptions) => Promise<void>
  reset: (events?: Event[]) => void
}

let eventSyncManager: EventSyncManager | null = null

export function configureEventSync(syncManager: EventSyncManager | null) {
  eventSyncManager = syncManager
}

function createEventId(): string {
  const cryptoApi = globalThis.crypto

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }

  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (Number(character) ^ (random & (15 >> (Number(character) / 4)))).toString(16)
  })
}

function uniqueDates(dates: string[]): string[] {
  return Array.from(new Set(dates)).sort()
}

function addDeletedOccurrence(master: Event, occurrenceDate: string): Event {
  return applyEventUpdate(master, {
    deletedOccurrences: uniqueDates([...(master.deletedOccurrences ?? []), occurrenceDate]),
  })
}

function endBeforeOccurrence(occurrenceDate: string): string {
  const date = new Date(`${occurrenceDate}T00:00:00`)
  date.setDate(date.getDate() - 1)
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

function truncateRuleBefore(rule: RecurrenceRule, occurrenceDate: string): RecurrenceRule {
  return {
    ...rule,
    endCondition: {
      type: 'date',
      until: endBeforeOccurrence(occurrenceDate),
    },
  }
}

function isSameRecurrenceRule(first: RecurrenceRule | undefined, second: RecurrenceRule | undefined): boolean {
  return JSON.stringify(first ?? null) === JSON.stringify(second ?? null)
}

function getFollowingRecurrenceRule(
  master: Event,
  changes: EventUpdate,
  occurrenceDate: string,
): RecurrenceRule | undefined {
  const requestedRule = changes.recurrenceRule ?? master.recurrenceRule

  if (!requestedRule) return requestedRule

  if (!master.recurrenceRule || !isSameRecurrenceRule(requestedRule, master.recurrenceRule)) {
    return requestedRule
  }

  if (requestedRule.endCondition.type !== 'count') return requestedRule

  const previousOccurrences = expandRecurrence(master, requestedRule, {
    start: master.startAt,
    end: endBeforeOccurrence(occurrenceDate),
  }).length

  return {
    ...requestedRule,
    endCondition: {
      type: 'count',
      occurrences: Math.max(1, requestedRule.endCondition.occurrences - previousOccurrences),
    },
  }
}

function withMasterDate(masterDateTime: string, sourceDateTime: string): string {
  const masterDate = new Date(masterDateTime)
  const sourceDate = new Date(sourceDateTime)

  return new Date(
    masterDate.getFullYear(),
    masterDate.getMonth(),
    masterDate.getDate(),
    sourceDate.getHours(),
    sourceDate.getMinutes(),
    sourceDate.getSeconds(),
    sourceDate.getMilliseconds(),
  ).toISOString()
}

function alignChangesToMasterDate(master: Event, changes: EventUpdate): EventUpdate {
  return {
    ...changes,
    startAt: changes.startAt ? withMasterDate(master.startAt, changes.startAt) : changes.startAt,
    endAt: changes.endAt ? withMasterDate(master.endAt, changes.endAt) : changes.endAt,
  }
}

function buildException(master: Event, changes: EventUpdate, occurrenceDate: string): Event {
  return buildEvent(
    {
      title: changes.title ?? master.title,
      description: changes.description ?? master.description,
      displayDetails: changes.displayDetails ?? master.displayDetails,
      startAt: changes.startAt ?? master.startAt,
      endAt: changes.endAt ?? master.endAt,
      allDay: changes.allDay ?? master.allDay,
      color: changes.color ?? master.color,
      eventTypeId: changes.eventTypeId ?? master.eventTypeId,
      linkedTodoId: changes.linkedTodoId ?? master.linkedTodoId,
      exceptionFor: master.id,
      exceptionDate: occurrenceDate,
    },
    createEventId(),
  )
}

async function persistEventChanges(previousEvents: Event[], nextEvents: Event[]) {
  if (!eventSyncManager) return

  const previousById = new Map(previousEvents.map((event) => [event.id, event]))
  const nextById = new Map(nextEvents.map((event) => [event.id, event]))

  for (const event of nextEvents) {
    const previous = previousById.get(event.id)

    if (!previous) {
      await eventSyncManager.saveEvent(event)
    } else if (JSON.stringify(previous) !== JSON.stringify(event)) {
      await eventSyncManager.updateEvent(event)
    }
  }

  for (const event of previousEvents) {
    if (!nextById.has(event.id)) {
      await eventSyncManager.deleteEvent(event.id)
    }
  }
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  isLoading: false,
  error: null,
  loadEvents: async (range) => {
    set({ isLoading: true, error: null })

    try {
      if (eventSyncManager) {
        const events = await eventSyncManager.getEvents(range)
        set({ events, isLoading: false })
        return getEventsInRange(events, range)
      }

      const events = getEventsInRange(get().events, range)
      set({ isLoading: false })
      return events
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load events'
      set({ isLoading: false, error: message })
      throw error
    }
  },
  createEvent: async (draft) => {
    try {
      const event = buildEvent(draft, createEventId())
      const previousEvents = get().events
      const nextEvents = [...previousEvents, event]

      set((state) => ({
        events: [...state.events, event],
        error: null,
      }))
      await persistEventChanges(previousEvents, nextEvents)
      return event
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create event'
      set({ error: message })
      throw error
    }
  },
  updateEvent: async (id, changes, options = {}) => {
    const existing = get().events.find((event) => event.id === id)
    const masterId = options.masterId ?? existing?.masterId
    const occurrenceDate = options.occurrenceDate

    if (masterId && options.recurrenceScope && occurrenceDate) {
      const master = get().events.find((event) => event.id === masterId)

      if (!master) {
        const message = `Recurring event master not found: ${masterId}`
        set({ error: message })
        throw new Error(message)
      }

      if (options.recurrenceScope === 'this') {
        const updatedMaster = addDeletedOccurrence(master, occurrenceDate)
        const exception = buildException(master, changes, occurrenceDate)
        const previousEvents = get().events
        const nextEvents = previousEvents
          .map((event) => (event.id === master.id ? updatedMaster : event))
          .concat(exception)

        set({
          events: nextEvents,
          error: null,
        })
        await persistEventChanges(previousEvents, nextEvents)
        return exception
      }

      if (options.recurrenceScope === 'following') {
        const truncatedMaster = applyEventUpdate(master, {
          recurrenceRule: master.recurrenceRule
            ? truncateRuleBefore(master.recurrenceRule, occurrenceDate)
            : master.recurrenceRule,
        })
        const newMaster = buildEvent(
          {
            title: changes.title ?? master.title,
            description: changes.description ?? master.description,
            displayDetails: changes.displayDetails ?? master.displayDetails,
            startAt: changes.startAt ?? master.startAt,
            endAt: changes.endAt ?? master.endAt,
            allDay: changes.allDay ?? master.allDay,
            color: changes.color ?? master.color,
            eventTypeId: changes.eventTypeId ?? master.eventTypeId,
            linkedTodoId: changes.linkedTodoId ?? master.linkedTodoId,
            recurrenceRule: getFollowingRecurrenceRule(master, changes, occurrenceDate),
          },
          createEventId(),
        )
        const previousEvents = get().events
        const nextEvents = previousEvents
          .map((event) => (event.id === master.id ? truncatedMaster : event))
          .concat(newMaster)

        set({
          events: nextEvents,
          error: null,
        })
        await persistEventChanges(previousEvents, nextEvents)
        return newMaster
      }

      const alignedChanges = alignChangesToMasterDate(master, changes)
      const updatedMaster = applyEventUpdate(master, alignedChanges)
      const previousEvents = get().events
      const nextEvents = previousEvents.map((event) =>
        event.id === master.id ? updatedMaster : event,
      )

      set({
        events: nextEvents,
        error: null,
      })
      await persistEventChanges(previousEvents, nextEvents)
      return updatedMaster
    }

    if (!existing) {
      const message = `Event not found: ${id}`
      set({ error: message })
      throw new Error(message)
    }

    try {
      const updated = applyEventUpdate(existing, changes)
      const previousEvents = get().events
      const nextEvents = previousEvents.map((event) => (event.id === id ? updated : event))

      set({
        events: nextEvents,
        error: null,
      })
      await persistEventChanges(previousEvents, nextEvents)
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update event'
      set({ error: message })
      throw error
    }
  },
  deleteEvent: async (id, options = {}) => {
    const existing = get().events.find((event) => event.id === id)
    const masterId = options.masterId ?? existing?.masterId
    const occurrenceDate = options.occurrenceDate

    if (masterId && options.recurrenceScope && occurrenceDate) {
      const master = get().events.find((event) => event.id === masterId)

      if (!master) {
        const message = `Recurring event master not found: ${masterId}`
        set({ error: message })
        throw new Error(message)
      }

      if (options.recurrenceScope === 'this') {
        const updatedMaster = addDeletedOccurrence(master, occurrenceDate)
        const previousEvents = get().events
        const nextEvents = previousEvents.map((event) =>
          event.id === master.id ? updatedMaster : event,
        )

        set({
          events: nextEvents,
          error: null,
        })
        await persistEventChanges(previousEvents, nextEvents)
        return
      }

      if (options.recurrenceScope === 'following') {
        const truncatedMaster = applyEventUpdate(master, {
          recurrenceRule: master.recurrenceRule
            ? truncateRuleBefore(master.recurrenceRule, occurrenceDate)
            : master.recurrenceRule,
        })
        const previousEvents = get().events
        const nextEvents = previousEvents.map((event) =>
          event.id === master.id ? truncatedMaster : event,
        )

        set({
          events: nextEvents,
          error: null,
        })
        await persistEventChanges(previousEvents, nextEvents)
        return
      }

      const previousEvents = get().events
      const nextEvents = previousEvents.filter(
        (event) => event.id !== master.id && event.exceptionFor !== master.id,
      )

      set({
        events: nextEvents,
        error: null,
      })
      await persistEventChanges(previousEvents, nextEvents)
      return
    }

    const previousEvents = get().events
    const nextEvents = previousEvents.filter((event) => event.id !== id)

    set({
      events: nextEvents,
      error: null,
    })
    await persistEventChanges(previousEvents, nextEvents)
  },
  reset: (events = []) => set({ events, isLoading: false, error: null }),
}))
