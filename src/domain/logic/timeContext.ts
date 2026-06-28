export type LocalTimeContext = {
  currentDate: string
  currentDateTime: string
  currentLocalDateTime: string
  locale: string
  localDateTimeLabel: string
  timezone: string
  timezoneName: string
  timezoneOffsetLabel: string
  timezoneOffsetMinutes: number
}

type DateTimeParts = {
  day: number
  hour: number
  minute: number
  month: number
  second: number
  year: number
}

const timezoneAliases: Record<string, string> = {
  'los angeles': 'America/Los_Angeles',
  pacific: 'America/Los_Angeles',
  'pacific standard time': 'America/Los_Angeles',
  'pacific time': 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  pst: 'America/Los_Angeles',
  pt: 'America/Los_Angeles',
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isoDate(parts: DateTimeParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function offsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

function localDateTimeWithOffset(parts: DateTimeParts, timezoneOffsetLabel: string): string {
  const offset = timezoneOffsetLabel.replace('UTC', '')
  return [
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    `T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
    offset,
  ].join('')
}

function normalizeTimezoneOverride(timezoneOverride?: string): string | null {
  const trimmed = timezoneOverride?.trim()
  if (!trimmed) return null

  return timezoneAliases[trimmed.toLowerCase()] ?? trimmed
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function timezoneOptions(timezone: string): { timeZone?: string } {
  return timezone === 'local' ? {} : { timeZone: timezone }
}

function dateTimeParts(date: Date, timezone: string): DateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...timezoneOptions(timezone),
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    year: 'numeric',
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  }
}

function offsetMinutesForTimezone(date: Date, timezone: string): number {
  const parts = dateTimeParts(date, timezone)
  const zonedUtcTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)

  return Math.round((zonedUtcTime - date.getTime()) / 60_000)
}

function formattedTimeLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    ...timezoneOptions(timezone),
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(date)
}

function formattedTimezoneName(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    ...timezoneOptions(timezone),
    day: 'numeric',
    hour: 'numeric',
    timeZoneName: 'long',
  }).formatToParts(date)

  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone
}

export function getLocalTimeContext(now = new Date(), timezoneOverride?: string): LocalTimeContext {
  const resolved = Intl.DateTimeFormat().resolvedOptions()
  const override = normalizeTimezoneOverride(timezoneOverride)
  const systemTimezone = resolved.timeZone || 'local'
  const timezone = override && isValidTimezone(override) ? override : systemTimezone
  const locale = resolved.locale || 'default'
  const parts = dateTimeParts(now, timezone)
  const timezoneOffsetMinutes = offsetMinutesForTimezone(now, timezone)
  const timezoneOffsetLabel = offsetLabel(timezoneOffsetMinutes)

  return {
    currentDate: isoDate(parts),
    currentDateTime: now.toISOString(),
    currentLocalDateTime: localDateTimeWithOffset(parts, timezoneOffsetLabel),
    locale,
    localDateTimeLabel: formattedTimeLabel(now, timezone),
    timezone,
    timezoneName: formattedTimezoneName(now, timezone),
    timezoneOffsetLabel,
    timezoneOffsetMinutes,
  }
}
