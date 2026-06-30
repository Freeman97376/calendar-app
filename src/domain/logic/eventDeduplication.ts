import type { Event } from '../schemas/event.schema'
import type { EventDraft } from './eventUtils'

export type DuplicateEventDraft = {
  draft: EventDraft
  existingEventId?: string
  index: number
  reason: 'existing-event' | 'same-batch'
}

type EventLike = Pick<EventDraft, 'allDay' | 'endAt' | 'eventTypeId' | 'startAt' | 'title'>

function normalizedDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.trim() : date.toISOString()
}

function eventIdentity(value: EventLike): string {
  return [
    value.title.trim().toLowerCase(),
    normalizedDateTime(value.startAt),
    normalizedDateTime(value.endAt),
    value.allDay === true ? 'all-day' : 'timed',
    value.eventTypeId?.trim().toLowerCase() || 'general',
  ].join('|')
}

export function isDuplicateEventDraft(draft: EventDraft, events: Event[]): boolean {
  const draftKey = eventIdentity(draft)
  return events.some((event) => eventIdentity(event) === draftKey)
}

export function splitUniqueEventDrafts(
  drafts: EventDraft[],
  events: Event[],
): {
  duplicateDrafts: DuplicateEventDraft[]
  uniqueDrafts: EventDraft[]
} {
  const existingKeys = new Map(events.map((event) => [eventIdentity(event), event.id]))
  const seenKeys = new Set<string>()
  const duplicateDrafts: DuplicateEventDraft[] = []
  const uniqueDrafts: EventDraft[] = []

  drafts.forEach((draft, index) => {
    const key = eventIdentity(draft)
    const existingEventId = existingKeys.get(key)

    if (existingEventId) {
      duplicateDrafts.push({ draft, existingEventId, index, reason: 'existing-event' })
      return
    }

    if (seenKeys.has(key)) {
      duplicateDrafts.push({ draft, index, reason: 'same-batch' })
      return
    }

    seenKeys.add(key)
    uniqueDrafts.push(draft)
  })

  return { duplicateDrafts, uniqueDrafts }
}
