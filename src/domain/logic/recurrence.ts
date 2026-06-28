import {
  addDays,
  addMonths,
  differenceInCalendarWeeks,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  parseISO,
  set,
  startOfDay,
  startOfWeek,
} from 'date-fns'

import type { DateRange, Event, RecurrenceRule, Weekday } from '../types'

const WEEK_STARTS_ON = 1

const weekdayByIndex: Record<number, Weekday> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}

function eventDurationMs(event: Event): number {
  return parseISO(event.endAt).getTime() - parseISO(event.startAt).getTime()
}

function occurrenceDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function isDeletedOccurrence(event: Event, date: Date): boolean {
  return event.deletedOccurrences?.includes(occurrenceDate(date)) ?? false
}

function overlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return end >= rangeStart && start <= rangeEnd
}

function shouldStop(rule: RecurrenceRule, occurrenceStart: Date, generatedCount: number): boolean {
  if (rule.endCondition.type === 'count' && generatedCount >= rule.endCondition.occurrences) {
    return true
  }

  if (rule.endCondition.type === 'date' && occurrenceStart > parseISO(rule.endCondition.until)) {
    return true
  }

  return false
}

function buildInstance(baseEvent: Event, start: Date): Event {
  const duration = eventDurationMs(baseEvent)
  const end = new Date(start.getTime() + duration)
  const date = occurrenceDate(start)

  return {
    ...baseEvent,
    id: `${baseEvent.id}_${date}`,
    masterId: baseEvent.id,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  }
}

function withBaseClock(base: Date, date: Date): Date {
  return set(date, {
    hours: base.getHours(),
    minutes: base.getMinutes(),
    seconds: base.getSeconds(),
    milliseconds: base.getMilliseconds(),
  })
}

function monthlyOccurrence(baseStart: Date, monthOffset: number, dayOfMonth: number): Date {
  const month = addMonths(startOfDay(baseStart), monthOffset)
  const lastDay = endOfMonth(month).getDate()
  const clampedDay = Math.min(dayOfMonth, lastDay)

  return withBaseClock(baseStart, set(month, { date: clampedDay }))
}

function includeOccurrence(
  instances: Event[],
  baseEvent: Event,
  start: Date,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const end = new Date(start.getTime() + eventDurationMs(baseEvent))

  if (!isDeletedOccurrence(baseEvent, start) && overlapsRange(start, end, rangeStart, rangeEnd)) {
    instances.push(buildInstance(baseEvent, start))
  }
}

function expandDaily(baseEvent: Event, rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date): Event[] {
  const baseStart = parseISO(baseEvent.startAt)
  const instances: Event[] = []
  let cursor = baseStart
  let generatedCount = 0

  while (cursor <= rangeEnd && !shouldStop(rule, cursor, generatedCount)) {
    includeOccurrence(instances, baseEvent, cursor, rangeStart, rangeEnd)
    generatedCount += 1
    cursor = addDays(cursor, rule.interval)
  }

  return instances
}

function expandWeekly(baseEvent: Event, rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date): Event[] {
  const baseStart = parseISO(baseEvent.startAt)
  const baseWeek = startOfWeek(baseStart, { weekStartsOn: WEEK_STARTS_ON })
  const selectedDays = new Set(rule.daysOfWeek ?? [weekdayByIndex[baseStart.getDay()]])
  const instances: Event[] = []
  let cursor = startOfDay(baseStart)
  let generatedCount = 0

  while (cursor <= rangeEnd) {
    const candidate = withBaseClock(baseStart, cursor)
    const weekDelta = differenceInCalendarWeeks(cursor, baseWeek, { weekStartsOn: WEEK_STARTS_ON })
    const isSelectedDay = selectedDays.has(weekdayByIndex[cursor.getDay()])
    const isValidInterval = weekDelta >= 0 && weekDelta % rule.interval === 0
    const isBeforeFirstOccurrence = isBefore(candidate, baseStart) && !isSameDay(candidate, baseStart)

    if (isSelectedDay && isValidInterval && !isBeforeFirstOccurrence) {
      if (shouldStop(rule, candidate, generatedCount)) break

      includeOccurrence(instances, baseEvent, candidate, rangeStart, rangeEnd)
      generatedCount += 1
    }

    cursor = addDays(cursor, 1)
  }

  return instances
}

function expandMonthly(baseEvent: Event, rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date): Event[] {
  const baseStart = parseISO(baseEvent.startAt)
  const dayOfMonth = rule.dayOfMonth ?? baseStart.getDate()
  const instances: Event[] = []
  let monthOffset = 0
  let generatedCount = 0

  while (true) {
    const candidate = monthlyOccurrence(baseStart, monthOffset, dayOfMonth)
    if (candidate > rangeEnd || shouldStop(rule, candidate, generatedCount)) break

    if (candidate >= baseStart) {
      includeOccurrence(instances, baseEvent, candidate, rangeStart, rangeEnd)
      generatedCount += 1
    }

    monthOffset += rule.interval
  }

  return instances
}

export function expandRecurrence(baseEvent: Event, rule: RecurrenceRule, viewRange: DateRange): Event[] {
  const rangeStart = parseISO(viewRange.start)
  const rangeEnd = parseISO(viewRange.end)

  if (rangeEnd < rangeStart) {
    return []
  }

  if (rule.frequency === 'daily') {
    return expandDaily(baseEvent, rule, rangeStart, rangeEnd)
  }

  if (rule.frequency === 'weekly' || rule.frequency === 'custom') {
    return expandWeekly(baseEvent, rule, rangeStart, rangeEnd)
  }

  return expandMonthly(baseEvent, rule, rangeStart, rangeEnd)
}
