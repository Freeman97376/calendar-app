import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday as dateFnsIsToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

type CalendarViewUnit = 'month' | 'week' | 'day'

const WEEK_STARTS_ON = 1
const DEFAULT_LOCALE = 'en-US'

export type CalendarDayInfo = {
  isoDate: string
  dayOfMonth: number
  weekdayShort: string
  weekdayLong: string
  monthShort: string
  monthLong: string
  isToday: boolean
}

export type MonthGridCell = CalendarDayInfo & {
  isCurrentMonth: boolean
}

export type DateRangeLike = {
  start: string
  end: string
}

export function parseCalendarDate(isoDate: string): Date {
  return parseISO(isoDate)
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayISODate(now = new Date()): string {
  return toISODate(now)
}

export function toISODateTime(date: Date): string {
  return date.toISOString()
}

export function formatDateLabel(isoDate: string, pattern: string): string {
  return format(parseCalendarDate(isoDate), pattern)
}

function formatDatePart(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function getDayInfo(
  isoDate: string,
  now = new Date(),
  locale = DEFAULT_LOCALE,
): CalendarDayInfo {
  const date = parseCalendarDate(isoDate)

  return {
    isoDate,
    dayOfMonth: Number(format(date, 'd')),
    weekdayShort: formatDatePart(date, locale, { weekday: 'short' }),
    weekdayLong: formatDatePart(date, locale, { weekday: 'long' }),
    monthShort: formatDatePart(date, locale, { month: 'short' }),
    monthLong: formatDatePart(date, locale, { month: 'long' }),
    isToday: toISODate(date) === toISODate(now),
  }
}

export function isSameCalendarDay(left: string, right: string): boolean {
  return left === right
}

export function shiftCalendarDate(isoDate: string, view: CalendarViewUnit, amount: number): string {
  const date = parseCalendarDate(isoDate)

  if (view === 'month') {
    return toISODate(addMonths(date, amount))
  }

  if (view === 'week') {
    return toISODate(addWeeks(date, amount))
  }

  return toISODate(addDays(date, amount))
}

export function getWeekDays(
  isoDate: string,
  now = new Date(),
  locale = DEFAULT_LOCALE,
): CalendarDayInfo[] {
  const weekStart = startOfWeek(parseCalendarDate(isoDate), { weekStartsOn: WEEK_STARTS_ON })

  return Array.from({ length: 7 }, (_, index) =>
    getDayInfo(toISODate(addDays(weekStart, index)), now, locale),
  )
}

export function getMonthGrid(
  isoDate: string,
  now = new Date(),
  locale = DEFAULT_LOCALE,
): MonthGridCell[][] {
  const focusedDate = parseCalendarDate(isoDate)
  const monthStart = startOfMonth(focusedDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON })
  const gridEnd = endOfWeek(endOfMonth(focusedDate), { weekStartsOn: WEEK_STARTS_ON })
  const weeks: MonthGridCell[][] = []

  let cursor = gridStart

  while (cursor <= gridEnd) {
    const week: MonthGridCell[] = []

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const isoDay = toISODate(cursor)

      week.push({
        ...getDayInfo(isoDay, now, locale),
        isCurrentMonth: isSameMonth(cursor, monthStart),
      })

      cursor = addDays(cursor, 1)
    }

    weeks.push(week)
  }

  return weeks
}

export function getViewRange(view: CalendarViewUnit, isoDate: string): DateRangeLike {
  const date = parseCalendarDate(isoDate)

  if (view === 'month') {
    return {
      start: toISODateTime(startOfDay(startOfMonth(date))),
      end: toISODateTime(endOfDay(endOfMonth(date))),
    }
  }

  if (view === 'week') {
    return {
      start: toISODateTime(startOfDay(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }))),
      end: toISODateTime(endOfDay(endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }))),
    }
  }

  return {
    start: toISODateTime(startOfDay(date)),
    end: toISODateTime(endOfDay(date)),
  }
}

export function getCalendarTitle(
  view: CalendarViewUnit,
  isoDate: string,
  locale = DEFAULT_LOCALE,
): string {
  if (view === 'month') {
    return formatDatePart(parseCalendarDate(isoDate), locale, { month: 'long', year: 'numeric' })
  }

  if (view === 'week') {
    const days = getWeekDays(isoDate, new Date(), locale)
    const first = days[0]
    const last = days[days.length - 1]
    const year = formatDatePart(parseCalendarDate(last.isoDate), locale, { year: 'numeric' })

    if (first.monthLong === last.monthLong) {
      return locale.startsWith('zh')
        ? `${year}${first.monthLong}${first.dayOfMonth}-${last.dayOfMonth}日`
        : `${first.monthLong} ${first.dayOfMonth}-${last.dayOfMonth}, ${formatDateLabel(last.isoDate, 'yyyy')}`
    }

    return locale.startsWith('zh')
      ? `${year}${first.monthShort}${first.dayOfMonth}日 - ${last.monthShort}${last.dayOfMonth}日`
      : `${first.monthShort} ${first.dayOfMonth} - ${last.monthShort} ${last.dayOfMonth}, ${formatDateLabel(last.isoDate, 'yyyy')}`
  }

  return formatDatePart(parseCalendarDate(isoDate), locale, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  })
}

export function getCalendarSubtitle(
  view: CalendarViewUnit,
  isoDate: string,
  locale = DEFAULT_LOCALE,
  labels: Partial<Record<'day' | 'month' | 'today' | 'week', string>> = {},
): string {
  if (view === 'month') {
    return labels.month ?? 'Month view'
  }

  if (view === 'week') {
    return labels.week ?? 'Week view'
  }

  const date = parseCalendarDate(isoDate)
  return dateFnsIsToday(date)
    ? (labels.today ?? 'Today')
    : formatDatePart(date, locale, { weekday: 'long' })
}
