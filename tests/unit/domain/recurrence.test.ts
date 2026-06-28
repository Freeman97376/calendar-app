import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { expandRecurrence } from '../../../src/domain/logic/recurrence'
import type { DateRange, Event, RecurrenceRule } from '../../../src/domain/types'

const baseEvent: Event = {
  id: 'series-1',
  title: 'Standup',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T16:30:00.000Z',
  allDay: false,
  eventTypeId: 'general',
  syncStatus: 'pending',
  createdAt: '2026-05-25T15:00:00.000Z',
  updatedAt: '2026-05-25T15:00:00.000Z',
}

const mayRange: DateRange = {
  start: '2026-05-01T00:00:00.000Z',
  end: '2026-05-31T23:59:59.999Z',
}

function dates(events: Event[]): string[] {
  return events.map((event) => format(new Date(event.startAt), 'yyyy-MM-dd'))
}

describe('expandRecurrence', () => {
  it('daily rule generates correct instances within range', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'count', occurrences: 3 },
    }

    expect(dates(expandRecurrence(baseEvent, rule, mayRange))).toEqual([
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
    ])
  })

  it('weekly rule on specific days of week', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: ['mon', 'wed'],
      endCondition: { type: 'count', occurrences: 4 },
    }

    expect(dates(expandRecurrence(baseEvent, rule, mayRange))).toEqual([
      '2026-05-25',
      '2026-05-27',
    ])
  })

  it('monthly rule on specific day of month', () => {
    const rule: RecurrenceRule = {
      frequency: 'monthly',
      interval: 1,
      dayOfMonth: 25,
      endCondition: { type: 'count', occurrences: 2 },
    }

    expect(
      dates(
        expandRecurrence(baseEvent, rule, {
          start: '2026-05-01T00:00:00.000Z',
          end: '2026-06-30T23:59:59.999Z',
        }),
      ),
    ).toEqual(['2026-05-25', '2026-06-25'])
  })

  it('monthly rule on Jan 31 moves February to Feb 28', () => {
    const event = {
      ...baseEvent,
      startAt: '2026-01-31T17:00:00.000Z',
      endAt: '2026-01-31T18:00:00.000Z',
    }
    const rule: RecurrenceRule = {
      frequency: 'monthly',
      interval: 1,
      dayOfMonth: 31,
      endCondition: { type: 'count', occurrences: 2 },
    }

    expect(
      dates(
        expandRecurrence(event, rule, {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-28T23:59:59.999Z',
        }),
      ),
    ).toEqual(['2026-01-31', '2026-02-28'])
  })

  it('monthly rule on Jan 31 in leap year moves February to Feb 29', () => {
    const event = {
      ...baseEvent,
      startAt: '2028-01-31T17:00:00.000Z',
      endAt: '2028-01-31T18:00:00.000Z',
    }
    const rule: RecurrenceRule = {
      frequency: 'monthly',
      interval: 1,
      dayOfMonth: 31,
      endCondition: { type: 'count', occurrences: 2 },
    }

    expect(
      dates(
        expandRecurrence(event, rule, {
          start: '2028-01-01T00:00:00.000Z',
          end: '2028-02-29T23:59:59.999Z',
        }),
      ),
    ).toEqual(['2028-01-31', '2028-02-29'])
  })

  it('end condition never stops at range boundary', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'never' },
    }

    expect(dates(expandRecurrence(baseEvent, rule, mayRange))).toEqual([
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
    ])
  })

  it('end condition date stops at until date', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'date', until: '2026-05-27T23:59:59.999Z' },
    }

    expect(dates(expandRecurrence(baseEvent, rule, mayRange))).toEqual([
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
    ])
  })

  it('end condition count stops after N occurrences', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'count', occurrences: 1 },
    }

    expect(dates(expandRecurrence(baseEvent, rule, mayRange))).toEqual(['2026-05-25'])
  })

  it('interval every 2 weeks', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 2,
      daysOfWeek: ['mon'],
      endCondition: { type: 'count', occurrences: 2 },
    }

    expect(
      dates(
        expandRecurrence(baseEvent, rule, {
          start: '2026-05-01T00:00:00.000Z',
          end: '2026-06-30T23:59:59.999Z',
        }),
      ),
    ).toEqual(['2026-05-25', '2026-06-08'])
  })

  it('interval every 3 months', () => {
    const rule: RecurrenceRule = {
      frequency: 'monthly',
      interval: 3,
      dayOfMonth: 25,
      endCondition: { type: 'count', occurrences: 2 },
    }

    expect(
      dates(
        expandRecurrence(baseEvent, rule, {
          start: '2026-05-01T00:00:00.000Z',
          end: '2026-09-30T23:59:59.999Z',
        }),
      ),
    ).toEqual(['2026-05-25', '2026-08-25'])
  })

  it('deleted occurrences are excluded from results', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'count', occurrences: 3 },
    }

    expect(dates(expandRecurrence({ ...baseEvent, deletedOccurrences: ['2026-05-26'] }, rule, mayRange))).toEqual([
      '2026-05-25',
      '2026-05-27',
    ])
  })

  it('weekly rule spanning DST transition keeps same clock time', () => {
    const event = {
      ...baseEvent,
      startAt: '2026-03-02T17:00:00.000Z',
      endAt: '2026-03-02T18:00:00.000Z',
    }
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: ['mon'],
      endCondition: { type: 'count', occurrences: 2 },
    }
    const instances = expandRecurrence(event, rule, {
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-03-15T23:59:59.999Z',
    })

    const baseLocalHour = new Date(instances[0].startAt).getHours()
    expect(instances.map((instance) => new Date(instance.startAt).getHours())).toEqual([
      baseLocalHour,
      baseLocalHour,
    ])
  })

  it('range start and end are inclusive', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'count', occurrences: 1 },
    }

    expect(
      dates(
        expandRecurrence(baseEvent, rule, {
          start: '2026-05-25T16:00:00.000Z',
          end: '2026-05-25T16:30:00.000Z',
        }),
      ),
    ).toEqual(['2026-05-25'])
  })

  it('empty range returns empty array', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'never' },
    }

    expect(
      expandRecurrence(baseEvent, rule, {
        start: '2026-05-31T23:59:59.999Z',
        end: '2026-05-01T00:00:00.000Z',
      }),
    ).toEqual([])
  })
})
