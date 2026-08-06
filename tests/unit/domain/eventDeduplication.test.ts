import { describe, expect, it } from 'vitest'

import { buildEvent, type EventDraft } from '../../../src/domain/logic/eventUtils'
import { splitUniqueEventDrafts } from '../../../src/domain/logic/eventDeduplication'

const draft: EventDraft = {
  endAt: '2026-07-06T17:00:00.000Z',
  eventTypeId: 'fitness',
  startAt: '2026-07-06T16:00:00.000Z',
  title: 'Workout block',
}

describe('event duplicate detection', () => {
  it('skips drafts that already exist in the calendar', () => {
    const existing = buildEvent(draft, 'event_1')
    const result = splitUniqueEventDrafts([draft], [existing])

    expect(result.uniqueDrafts).toHaveLength(0)
    expect(result.duplicateDrafts).toEqual([
      expect.objectContaining({
        existingEventId: 'event_1',
        index: 0,
        reason: 'existing-event',
      }),
    ])
  })

  it('keeps one copy and skips duplicates within the same apply batch', () => {
    const result = splitUniqueEventDrafts([draft, { ...draft }], [])

    expect(result.uniqueDrafts).toHaveLength(1)
    expect(result.duplicateDrafts).toEqual([
      expect.objectContaining({
        index: 1,
        reason: 'same-batch',
      }),
    ])
  })
})
