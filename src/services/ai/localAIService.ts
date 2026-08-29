import {
  AIBreakdownResultSchema,
  AICalendarActionPlanSchema,
  AIEnabledToolRouteResultSchema,
  AIProgressToolResultSchema,
  AIToolActivationResultSchema,
} from '../../domain/schemas/ai.schema'
import { ToolSessionResultSchema } from '../../domain/schemas/toolSession.schema'
import { isValidTimezone, localDateTimeInTimezoneToISOString } from '../../domain/logic/timeContext'
import type {
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  AIEnabledToolRouteRequest,
  AIEnabledToolRouteResult,
  AIProgressToolRequest,
  AIProgressToolResult,
  AIToolActivationRequest,
  AIToolActivationResult,
  ToolSessionRequest,
  ToolSessionResult,
} from '../../domain/types'
import type { AIConversationContext, AIConversationMessage, IAIService } from './IAIService'

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

type TimezoneContext = {
  currentDate?: string
  currentLocalDateTime?: string
  timezone?: string
  timezoneOffsetMinutes?: number
  today?: string
}

function toISODateTime(date: string, hour: number, minute = 0, context?: TimezoneContext): string {
  const [year, month, day] = date.split('-').map(Number)
  if (context?.timezone) {
    const zonedDateTime = localDateTimeInTimezoneToISOString(date, hour, minute, context.timezone)
    if (zonedDateTime) return zonedDateTime
    if (context.timezone !== 'local' && isValidTimezone(context.timezone)) {
      throw new Error(
        `The local time ${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} does not exist in ${context.timezone}. Choose a different time.`,
      )
    }
  }
  if (typeof context?.timezoneOffsetMinutes === 'number') {
    const utcTime =
      Date.UTC(year, month - 1, day, hour, minute, 0, 0) - context.timezoneOffsetMinutes * 60_000

    return new Date(utcTime).toISOString()
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function toISODateTimeFromTime(date: string, time: string, context?: TimezoneContext): string {
  const [hour = 9, minute = 0] = time.split(':').map(Number)
  return toISODateTime(date, hour, minute, context)
}

function addMinutes(isoDateTime: string, minutes: number): string {
  return new Date(new Date(isoDateTime).getTime() + minutes * 60_000).toISOString()
}

function timedEventsOverlap(
  left: { startAt: string; endAt: string },
  right: { startAt: string; endAt: string },
): boolean {
  const leftStart = new Date(left.startAt)
  const leftEnd = new Date(left.endAt)
  const rightStart = new Date(right.startAt)
  const rightEnd = new Date(right.endAt)

  if (
    Number.isNaN(leftStart.getTime()) ||
    Number.isNaN(leftEnd.getTime()) ||
    Number.isNaN(rightStart.getTime()) ||
    Number.isNaN(rightEnd.getTime())
  ) {
    return false
  }

  return leftStart < rightEnd && rightStart < leftEnd
}

function nextNonConflictingStart(
  date: string,
  time: string,
  durationMinutes: number,
  context: AIProgressToolRequest,
): { shifted: boolean; startAt: string } {
  let startAt = toISODateTimeFromTime(date, time, context)
  let shifted = false

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = { startAt, endAt: addMinutes(startAt, durationMinutes) }
    const overlaps = context.calendarEvents.some((event) => timedEventsOverlap(candidate, event))

    if (!overlaps) return { shifted, startAt }

    startAt = addMinutes(startAt, 60)
    shifted = true
  }

  return { shifted, startAt }
}

function nextWeekday(isoDate: string, weekday: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  let offset = (weekday - date.getDay() + 7) % 7
  if (offset === 0) offset = 7
  return addDays(isoDate, offset)
}

function isFullWeekRequest(message: string): boolean {
  return /\b(next week|full week|whole week|weekly plan|week plan)\b|下周|一整周|整周|全周|一周/.test(
    message.toLowerCase(),
  )
}

function parseRequestedSessionCount(value: string): number | undefined {
  if (/\b(daily|every day)\b|每天/.test(value.toLowerCase())) return 7
  if (/\bweekdays?\b|工作日/.test(value.toLowerCase())) return 5

  const digitMatch = value.match(
    /(\d{1,2})\s*(?:sessions?|blocks?|workouts?|lessons?|classes?|times?|hours?|hrs?|次|节|个|小时)/i,
  )
  if (digitMatch) return Number(digitMatch[1])

  const chineseCounts: Array<[RegExp, number]> = [
    [/七\s*(?:次|节|个|天|小时)/, 7],
    [/六\s*(?:次|节|个|天|小时)/, 6],
    [/五\s*(?:次|节|个|天|小时)/, 5],
    [/四\s*(?:次|节|个|天|小时)/, 4],
    [/三\s*(?:次|节|个|天|小时)/, 3],
    [/两\s*(?:次|节|个|天|小时)|二\s*(?:次|节|个|天|小时)/, 2],
    [/一\s*(?:次|节|个|天|小时)/, 1],
  ]
  return chineseCounts.find(([pattern]) => pattern.test(value))?.[1]
}

function clampSessionCount(value: number): number {
  return Math.min(20, Math.max(1, Math.floor(value)))
}

function sessionOffsets(sessionCount: number): number[] {
  if (sessionCount <= 1) return [0]
  if (sessionCount === 2) return [0, 3]
  if (sessionCount === 3) return [0, 2, 4]
  if (sessionCount === 4) return [0, 1, 3, 5]
  return Array.from({ length: sessionCount }, (_, index) => index)
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}...` : value
}

function latestProgressToolMessage(request: AIProgressToolRequest): string {
  const instruction = request.userInstruction?.trim()
  if (!instruction) return ''

  const match = instruction.match(
    /Latest user message:\s*([\s\S]*?)(?:\n\nRecent tool conversation:|\n\nTask:|$)/i,
  )
  return truncateText((match?.[1] ?? instruction).trim(), 220)
}

function isAutomaticRequirementConfirmation(message: string): boolean {
  return /^confirm current requirements\b/i.test(message.trim())
}

type LearningRouteKind = 'agent' | 'seo'

function learningRouteKindFromInput(request: AIProgressToolRequest): LearningRouteKind {
  const text = [
    request.formInput.learningTrack,
    request.formInput.goal,
    request.formInput.outcome,
    request.sourceToolId,
    request.userInstruction,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return /\bseo\b|search engine|keyword|on-page|technical seo|搜索引擎|关键词|排名/.test(text)
    ? 'seo'
    : 'agent'
}

function learningRouteLabel(kind: LearningRouteKind): string {
  return kind === 'seo' ? 'SEO' : 'AI agent'
}

function learningRouteArticle(kind: LearningRouteKind): string {
  return kind === 'agent' ? 'an' : 'a'
}

function learningMilestones(
  kind: LearningRouteKind,
  outcome: string,
  today: string,
  hasExisting: boolean,
) {
  if (kind === 'seo') {
    return [
      {
        title: 'SEO foundations and keyword research',
        description: 'Understand search intent, keyword groups, competitors, and baseline metrics.',
        dueDate: addDays(today, 7),
        status: hasExisting ? 'in_progress' : 'not_started',
      },
      {
        title: 'On-page and technical SEO',
        description:
          'Practice page titles, internal links, crawlability, performance, and indexability checks.',
        dueDate: addDays(today, 14),
        status: 'not_started',
      },
      {
        title: 'Content strategy and analytics',
        description: 'Build a content plan, measurement loop, and weekly review habit.',
        dueDate: addDays(today, 21),
        status: 'not_started',
      },
      {
        title: 'SEO project build',
        description: `Create and present a repeatable SEO workflow for: ${outcome}.`,
        dueDate: addDays(today, 28),
        status: 'not_started',
      },
    ] as const
  }

  return [
    {
      title: 'Foundations and task framing',
      description: 'Understand agent goals, state, constraints, and success criteria.',
      dueDate: addDays(today, 7),
      status: hasExisting ? 'in_progress' : 'not_started',
    },
    {
      title: 'Tool use and structured outputs',
      description: 'Practice tool calls, schemas, validation, and review-before-apply flows.',
      dueDate: addDays(today, 14),
      status: 'not_started',
    },
    {
      title: 'Retrieval, memory, and evaluation',
      description: 'Add memory/retrieval context, compact prompts, and acceptance checks.',
      dueDate: addDays(today, 21),
      status: 'not_started',
    },
    {
      title: 'Demo agent build',
      description: `Build and present a demo that achieves: ${outcome}.`,
      dueDate: addDays(today, 28),
      status: 'not_started',
    },
  ] as const
}

function learningSessionTopic(
  index: number,
  outcome: string,
  goal: string,
  kind: LearningRouteKind,
) {
  const seoTopics = [
    {
      actionTitle: 'Create the SEO baseline audit',
      description: `Define audience, target pages, baseline traffic, rankings, and technical risks for ${goal}.`,
      eventTitle: 'SEO learning block: baseline audit',
      focus: 'baseline audit, goals, search intent, and current performance',
      milestoneTitle: 'SEO foundations and keyword research',
    },
    {
      actionTitle: 'Build a keyword and intent map',
      description: 'Group seed keywords by intent, difficulty, funnel stage, and page target.',
      eventTitle: 'SEO learning block: keyword research',
      focus: 'keyword research, intent mapping, and competitor comparison',
      milestoneTitle: 'SEO foundations and keyword research',
    },
    {
      actionTitle: 'Draft an on-page SEO checklist',
      description:
        'Practice titles, headings, internal links, schema candidates, and content relevance checks.',
      eventTitle: 'SEO learning block: on-page optimization',
      focus: 'on-page optimization and reusable checklist design',
      milestoneTitle: 'On-page and technical SEO',
    },
    {
      actionTitle: 'Run technical SEO checks',
      description:
        'Review crawlability, indexability, performance, mobile usability, and broken-link risks.',
      eventTitle: 'SEO learning block: technical checks',
      focus: 'technical SEO checks and remediation notes',
      milestoneTitle: 'On-page and technical SEO',
    },
    {
      actionTitle: 'Create a content plan and analytics loop',
      description:
        'Turn keyword groups into content briefs, publishing cadence, and analytics checkpoints.',
      eventTitle: 'SEO learning block: content analytics',
      focus: 'content planning, measurement, and weekly review',
      milestoneTitle: 'Content strategy and analytics',
    },
    {
      actionTitle: 'Build the SEO workflow demo',
      description: `Package the audit, keyword map, and content plan into a repeatable workflow for ${outcome}.`,
      eventTitle: 'SEO learning block: project build',
      focus: `build the smallest SEO workflow demo for ${outcome}`,
      milestoneTitle: 'SEO project build',
    },
  ]

  const agentTopics = [
    {
      actionTitle: 'Write the agent task contract',
      description: `Define goal, audience, input/output, constraints, and success criteria for ${goal}.`,
      eventTitle: 'AI agent skill block: task framing',
      focus: 'write the task contract and success criteria',
      milestoneTitle: 'Foundations and task framing',
    },
    {
      actionTitle: 'Practice prompt and task framing',
      description:
        'Turn one broad request into a precise task, inputs, constraints, and acceptance checks.',
      eventTitle: 'AI agent skill block: prompt framing',
      focus: 'prompt shape, task boundaries, and acceptance criteria',
      milestoneTitle: 'Foundations and task framing',
    },
    {
      actionTitle: 'Implement one structured tool call exercise',
      description:
        'Create a small JSON schema, mock a tool response, validate it, and handle failures.',
      eventTitle: 'AI agent skill block: tool use',
      focus: 'tool calls, schemas, validation, and review-before-apply behavior',
      milestoneTitle: 'Tool use and structured outputs',
    },
    {
      actionTitle: 'Design a compact memory retrieval prompt',
      description: 'Limit context to the smallest useful facts and record what was used.',
      eventTitle: 'AI agent skill block: retrieval and memory',
      focus: 'compact retrieval context and memory-backed planning',
      milestoneTitle: 'Retrieval, memory, and evaluation',
    },
    {
      actionTitle: 'Create one evaluation checklist',
      description: 'Define test cases, failure modes, and safety checks for the agent workflow.',
      eventTitle: 'AI agent skill block: eval and safety',
      focus: 'evaluation cases, safety checks, and failure handling',
      milestoneTitle: 'Retrieval, memory, and evaluation',
    },
    {
      actionTitle: 'Build the demo agent loop',
      description: `Implement a small loop that can demonstrate: ${outcome}.`,
      eventTitle: 'AI agent skill block: demo build',
      focus: `build the smallest demo loop for ${outcome}`,
      milestoneTitle: 'Demo agent build',
    },
    {
      actionTitle: 'Review and present the demo',
      description: 'Run the demo, document what worked, and capture the next iteration.',
      eventTitle: 'AI agent skill block: demo review',
      focus: 'demo walkthrough, evidence, and next iteration notes',
      milestoneTitle: 'Demo agent build',
    },
  ]

  const topics = kind === 'seo' ? seoTopics : agentTopics
  return topics[index % topics.length]
}

function addMinutesToDate(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString()
}

function currentDateTimeFromContext(context: AICalendarContext): Date {
  const candidate = context.currentDateTime ? new Date(context.currentDateTime) : new Date()
  if (!Number.isNaN(candidate.getTime())) return candidate

  const [year, month, day] = context.today.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function currentWallClockFromContext(context: TimezoneContext): {
  date: string
  hour: number
  minute: number
  second: number
} {
  const local = context.currentLocalDateTime?.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  )

  if (local) {
    return {
      date: local[1],
      hour: Number(local[2]),
      minute: Number(local[3]),
      second: Number(local[4] ?? 0),
    }
  }

  const now =
    'today' in context ? currentDateTimeFromContext(context as AICalendarContext) : new Date()

  return {
    date: context.currentDate ?? context.today ?? toISODate(now),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  }
}

function hasExplicitTime(command: string): boolean {
  return (
    /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(command) ||
    /\bat\s+\d{1,2}(?::\d{2})?\b/i.test(command)
  )
}

function nextWallClockBoundary(clock: ReturnType<typeof currentWallClockFromContext>): {
  date: string
  hour: number
  minute: number
} {
  if (clock.minute < 30) return { date: clock.date, hour: clock.hour, minute: 30 }

  if (clock.hour < 23) return { date: clock.date, hour: clock.hour + 1, minute: 0 }

  return { date: addDays(clock.date, 1), hour: 0, minute: 0 }
}

function parseDate(command: string, today: string): string {
  const lower = command.toLowerCase()
  const explicitDate = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/)

  if (explicitDate) return explicitDate[1]
  if (lower.includes('tomorrow')) return addDays(today, 1)
  if (lower.includes('today')) return today

  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/)
  if (inDays) return addDays(today, Number(inDays[1]))

  const todayDate = new Date(`${today}T00:00:00`)
  const matchedWeekday = weekdays.find((weekday) => lower.includes(weekday))

  if (!matchedWeekday) return today

  const targetDay = weekdays.indexOf(matchedWeekday)
  const currentDay = todayDate.getDay()
  const dayOffset = (targetDay - currentDay + 7) % 7 || 7
  return addDays(today, dayOffset)
}

function parseTime(
  command: string,
  context: AICalendarContext,
  date: string,
): { hour: number; minute: number } {
  const lower = command.toLowerCase()
  const meridiemMatch = command.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  const atMatch = meridiemMatch ? null : command.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i)
  const match = meridiemMatch ?? atMatch

  if (!match) {
    if (/\b(tonight|dinner|evening)\b/i.test(command)) {
      const current = currentWallClockFromContext(context)
      if (date === current.date && current.hour >= 19) return nextWallClockBoundary(current)
      return { hour: 19, minute: 0 }
    }
    if (date === (context.currentDate ?? context.today) && /\btoday\b/i.test(command)) {
      return nextWallClockBoundary(currentWallClockFromContext(context))
    }
    if (/\blunch\b/i.test(command)) return { hour: 12, minute: 0 }
    if (/\bafternoon\b/i.test(command)) return { hour: 14, minute: 0 }
    return { hour: 9, minute: 0 }
  }

  const rawHour = Number(match[1])
  const period = meridiemMatch?.[3]?.toLowerCase()
  const rawMinute = Number(match[2] ?? 0)
  const minute = Math.min(59, Math.max(0, rawMinute))

  if (period === 'pm' && rawHour < 12) return { hour: rawHour + 12, minute }
  if (period === 'am' && rawHour === 12) return { hour: 0, minute }

  let hour = Math.min(23, rawHour)
  if (!period && rawHour >= 1 && rawHour <= 11) {
    if (/\b(tonight|dinner|evening)\b/i.test(lower)) {
      hour = rawHour + 12
    } else if (date === (context.currentDate ?? context.today)) {
      const now = currentDateTimeFromContext(context)
      const morning = new Date(toISODateTime(date, rawHour, minute, context))
      const evening = new Date(toISODateTime(date, rawHour + 12, minute, context))

      if (morning <= now && evening > now) hour = rawHour + 12
    }
  }

  return { hour, minute }
}

function parseDurationMinutes(command: string): number {
  const hours =
    command.match(/\b(?:for|lasting)\s+(\d+)\s*(hour|hours|hr|hrs)\b/i) ??
    command.match(/\b(\d+)[-\s]*(hour|hr)\s+(meeting|event|appointment|block)\b/i)
  if (hours) return Math.min(480, Math.max(5, Number(hours[1]) * 60))

  const minutes = command.match(/\b(?:for|lasting)\s+(\d+)\s*(minute|minutes|min|mins)\b/i)
  if (minutes) return Math.min(480, Math.max(5, Number(minutes[1])))

  return 60
}

function taskEtaMinutesFromCommand(command: string): number {
  if (/\b(?:for|lasting)\s+\d+\s*(?:hour|hours|hr|hrs|minute|minutes|min|mins)\b/i.test(command)) {
    return parseDurationMinutes(command)
  }

  if (/\b\d+[-\s]*(?:hour|hr)\s+(?:task|todo|work|focus|block)\b/i.test(command)) {
    return parseDurationMinutes(command)
  }

  return 30
}

function taskEnergyNeededFromCommand(command: string): 'high' | 'medium' | 'low' {
  if (/\b(deep work|hard|intense|high energy|focus)\b/i.test(command)) return 'high'
  if (/\b(easy|quick|light|low energy|admin)\b/i.test(command)) return 'low'
  return 'medium'
}

function parseRelativeStartAt(command: string, context: AICalendarContext): string | null {
  const lower = command.toLowerCase()
  const now = currentDateTimeFromContext(context)
  const minutesMatch = lower.match(/\bin\s+(\d+)\s*(minutes?|mins?)\b/)
  const hoursMatch = lower.match(/\bin\s+(\d+)\s*(hours?|hrs?)\b/)

  if (minutesMatch) return addMinutesToDate(now, Number(minutesMatch[1]))
  if (hoursMatch) return addMinutesToDate(now, Number(hoursMatch[1]) * 60)
  if (/\bin\s+(a|an|one)\s+(hour|hr)\b/.test(lower)) return addMinutesToDate(now, 60)
  if (/\bhalf\s+an\s+hour\b/.test(lower)) return addMinutesToDate(now, 30)
  if (/\bsoon\b/.test(lower)) return addMinutesToDate(now, 30)
  if (/\blater today\b/.test(lower)) return addMinutesToDate(now, 120)

  if (!hasExplicitTime(command) && /\b(tonight|dinner|evening)\b/.test(lower)) {
    const currentDate = context.currentDate ?? context.today
    const requestedDate = parseDate(command, currentDate)
    const current = currentWallClockFromContext(context)
    const target =
      current.date === requestedDate && current.hour >= 19
        ? nextWallClockBoundary(current)
        : { date: requestedDate, hour: 19, minute: 0 }

    return toISODateTime(target.date, target.hour, target.minute, context)
  }

  if (!hasExplicitTime(command) && /\btoday\b/.test(lower)) {
    const target = nextWallClockBoundary(currentWallClockFromContext(context))

    return toISODateTime(target.date, target.hour, target.minute, context)
  }

  return null
}

function parseCommandStartAt(command: string, context: AICalendarContext): string {
  const relativeStartAt = parseRelativeStartAt(command, context)
  if (relativeStartAt) return relativeStartAt

  const date = parseDate(command, context.currentDate ?? context.today)
  const { hour, minute } = parseTime(command, context, date)
  return toISODateTime(date, hour, minute, context)
}

function firstQuotedText(command: string): string | null {
  const match = command.match(/"([^"]+)"|'([^']+)'/)
  return match?.[1] ?? match?.[2] ?? null
}

function cleanupTitle(command: string): string {
  const quoted = firstQuotedText(command)
  if (quoted) return quoted

  return command
    .replace(/\b(create|add|schedule|make|new|please)\b/gi, '')
    .replace(/\b(a|an|the)\b/gi, '')
    .replace(/\b(calendar\s+event|event|meeting|appointment|todo|task|to-do)\b/gi, '')
    .replace(
      /\b(later today|today|tomorrow|tonight|soon|later|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      '',
    )
    .replace(/\bin\s+(\d+|a|an|one)\s*(minutes?|mins?|hours?|hrs?)\b/gi, '')
    .replace(/\bhalf\s+an\s+hour\b/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, '')
    .replace(/\b\d+\s*(hour|hours|hr|hrs|minute|minutes|min|mins)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function bestTitle(command: string, fallback: string): string {
  const title = cleanupTitle(command)
  return title || fallback
}

function findByTitle<T extends { title: string }>(items: T[], command: string): T | undefined {
  const lower = command.toLowerCase()
  return [...items]
    .sort((left, right) => right.title.length - left.title.length)
    .find((item) => lower.includes(item.title.toLowerCase()))
}

function renamedTitle(command: string): string | undefined {
  const quoted = command.match(/\bto\s+"([^"]+)"/i) ?? command.match(/\bto\s+'([^']+)'/i)
  if (quoted) return quoted[1]

  const match = command.match(/\bto\s+(.+)$/i)
  return match?.[1]?.trim()
}

function eventTypeIdFromCommand(command: string, context: AICalendarContext): string | undefined {
  const lower = command.toLowerCase()
  const eventType = context.eventTypes.find(
    (type) => !type.isArchived && lower.includes(type.label.toLowerCase()),
  )

  if (eventType) return eventType.id
  if (lower.includes('project')) return context.eventTypes.find((type) => type.id === 'project')?.id
  return undefined
}

function activationLatestMessage(request: AIToolActivationRequest): string {
  return (
    request.messages
      .slice()
      .reverse()
      .find((message) => message.role === 'user')
      ?.content.trim() ?? ''
  )
}

function uniqueTags(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const tag = value.trim().toLowerCase()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    output.push(tag)
  }

  return output.slice(0, 16)
}

function activationAlias(request: AIToolActivationRequest, latest: string): string {
  const fromFor = latest.match(/\b(?:for|about|learn|build|manage)\s+([^,.!?]{3,40})/i)?.[1]?.trim()
  const base = fromFor || request.templateLabel
  const candidate = base.replace(/\s+/g, ' ').trim()

  if (!candidate) return request.templateLabel
  return candidate.length > 48 ? candidate.slice(0, 48).trimEnd() : candidate
}

function baseActivationForm(
  request: AIToolActivationRequest,
  latest: string,
): Record<string, string> {
  const lower = `${request.templateId} ${request.templateLabel} ${latest}`.toLowerCase()
  if (
    lower.includes('fitness') ||
    lower.includes('workout') ||
    lower.includes('train') ||
    lower.includes('\u5065\u8eab') ||
    lower.includes('\u8bad\u7ec3') ||
    lower.includes('\u8dd1\u6b65')
  ) {
    return {
      constraints: latest,
      equipment: '',
      frequency: '3 times per week',
      goal: latest || 'Build a fitness routine',
      heightCm: '',
      level: 'beginner',
      preferences: '',
      preferredTime: '07:00',
      sessionLength: '45',
      weightKg: '',
    }
  }

  if (lower.includes('seo')) {
    return {
      goal: latest || 'Learn SEO skills',
      learningTrack: 'SEO skills',
      level: 'beginner',
      outcome: 'build a repeatable SEO audit and content plan',
      preferredTime: '19:00',
      weeklyTime: '3 hours per week',
    }
  }

  if (lower.includes('learn') || lower.includes('agent') || lower.includes('\u5b66\u4e60')) {
    return {
      goal: latest || 'Learn AI agent skills',
      learningTrack: lower.includes('seo') ? 'SEO skills' : 'AI agent skills',
      level: 'beginner',
      outcome: lower.includes('seo') ? 'build an SEO workflow' : 'ship a small AI agent demo',
      preferredTime: '19:00',
      weeklyTime: '3 hours per week',
    }
  }

  return {
    requirement: latest || request.templateDescription || request.templateLabel,
  }
}

function hasOwnString(record: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function activationForm(request: AIToolActivationRequest, latest: string): Record<string, string> {
  const inferred = baseActivationForm(request, latest)
  const activationFields = request.activationFields ?? []
  if (!activationFields.length) return inferred

  return Object.fromEntries(
    activationFields.map((field) => {
      const draft = request.activationFormDraft ?? {}
      if (hasOwnString(draft, field.id)) return [field.id, draft[field.id]?.trim() ?? '']
      return [field.id, inferred[field.id]?.trim() || field.defaultValue || '']
    }),
  )
}

function activationWarnings(
  request: AIToolActivationRequest,
  form: Record<string, string>,
): string[] {
  return (request.activationFields ?? [])
    .filter((field) => field.recommended && !form[field.id]?.trim())
    .map(
      (field) =>
        `Missing recommended ${field.label}; plan accuracy may be lower${
          field.accuracyImpact ? ` because ${field.accuracyImpact}` : '.'
        }`,
    )
}

function routeScore(
  message: string,
  tool: AIEnabledToolRouteRequest['enabledTools'][number],
): number {
  const lower = message.toLowerCase()
  const fields = [
    tool.instanceAlias,
    tool.toolName,
    tool.templateId,
    tool.sourceToolId,
    tool.activationSummary,
    tool.longTermGoalLabel ?? '',
    ...tool.toolFeatures,
    ...tool.implementationPlan,
    ...tool.routeTags,
  ]
  let score = 0

  for (const field of fields) {
    const normalized = field.toLowerCase()
    if (!normalized) continue
    if (lower.includes(normalized)) {
      score += normalized === tool.instanceAlias.toLowerCase() ? 4 : 2
      continue
    }

    for (const token of normalized.split(/[^a-z0-9]+/).filter((entry) => entry.length > 2)) {
      if (lower.includes(token)) score += 1
    }
  }

  if (
    (/\b(workout|fitness|training|exercise|gym|run)\b/i.test(lower) ||
      /\u5065\u8eab|\u8bad\u7ec3|\u8dd1\u6b65|\u953b\u70bc|\u8fd0\u52a8|\u529b\u91cf/.test(
        lower,
      )) &&
    tool.sourceToolId.includes('fitness')
  ) {
    score += 3
  }
  if (
    (/\b(seo|keyword|ranking|search engine|content)\b/i.test(lower) ||
      /\u641c\u7d22\u4f18\u5316|\u5173\u952e\u8bcd|\u6392\u540d|\u5185\u5bb9|\u6d41\u91cf/.test(
        lower,
      )) &&
    tool.sourceToolId.includes('seo')
  ) {
    score += 3
  }
  if (
    (/\b(agent|prompt|tool use|retrieval|memory|eval)\b/i.test(lower) ||
      /\u667a\u80fd\u4f53|\u63d0\u793a\u8bcd|\u68c0\u7d22|\u8bb0\u5fc6|\u8bc4\u4f30/.test(lower)) &&
    tool.sourceToolId.includes('agent')
  ) {
    score += 3
  }

  return score
}

export class LocalAIService implements IAIService {
  isAvailable(): boolean {
    return true
  }

  async breakdownGoal(goal: string): Promise<AIBreakdownResult> {
    const title = bestTitle(goal, goal)
    const isProject = /project|prepare|plan|build|launch/i.test(goal)

    return AIBreakdownResultSchema.parse({
      goal,
      steps: [
        {
          title: isProject ? `Plan ${title}` : title,
          description: 'Generated by the local fallback planner.',
          durationMinutes: isProject ? 45 : 60,
          energyNeeded: isProject ? 'high' : 'medium',
          suggestedDayOffset: 0,
          suggestedHour: 9,
          priority: isProject ? 'high' : 'medium',
        },
        ...(isProject
          ? [
              {
                title: `Execute ${title}`,
                durationMinutes: 60,
                energyNeeded: 'medium',
                suggestedDayOffset: 1,
                suggestedHour: 10,
                priority: 'medium',
              },
            ]
          : []),
      ],
      totalEstimatedHours: isProject ? 1.75 : 1,
      notes: 'Local planner result. Configure the API provider for model-based planning.',
    })
  }

  async planCalendarActions(
    command: string,
    context: AICalendarContext,
  ): Promise<AICalendarActionPlan> {
    const lower = command.toLowerCase()
    const todo = findByTitle(context.todos, command)
    const event = findByTitle(context.events, command)

    if (lower.includes('todo') || lower.includes('task')) {
      return this.planTodoAction(command, context, todo)
    }

    if (lower.includes('complete') || lower.includes('done') || lower.includes('finish')) {
      return todo
        ? this.planTodoAction(command, context, todo)
        : this.planEventAction(command, context, event)
    }

    return this.planEventAction(command, context, event)
  }

  async runToolSession(request: ToolSessionRequest): Promise<ToolSessionResult> {
    const lowerPreset = `${request.presetId} ${request.presetLabel}`.toLowerCase()

    if (lowerPreset.includes('workout')) {
      return this.planWorkoutToolSession(request)
    }

    return this.planDiningToolSession(request)
  }

  async runProgressTool(request: AIProgressToolRequest): Promise<AIProgressToolResult> {
    if (request.toolKind === 'agent-learning') {
      return this.planAgentLearningProgressTool(request)
    }

    return this.planFitnessProgressTool(request)
  }

  async runToolActivation(request: AIToolActivationRequest): Promise<AIToolActivationResult> {
    const latest = activationLatestMessage(request)
    const needsMoreInfo = !latest
    const suggestedInstanceAlias = activationAlias(request, latest)
    const routeTags = uniqueTags([
      ...request.routeTags,
      ...request.capabilityTags,
      request.templateLabel,
      suggestedInstanceAlias,
      ...latest.split(/[^a-zA-Z0-9]+/).filter((entry) => entry.length > 3),
    ])
    const activationSummary = needsMoreInfo
      ? `Configure ${request.templateLabel} by describing the goal, constraints, cadence, and target outcome.`
      : `Prepared ${request.templateLabel} active tool for: ${latest}`

    const form = activationForm(request, latest)

    return AIToolActivationResultSchema.parse({
      activationForm: form,
      activationSummary,
      assistantReply: needsMoreInfo
        ? `Tell me the goal, constraints, cadence, and target outcome for this ${request.templateLabel} instance.`
        : `I can register "${suggestedInstanceAlias}" from ${request.templateLabel}. Review the name, then register the active tool.`,
      needsMoreInfo,
      routeTags,
      suggestedInstanceAlias,
      warnings: activationWarnings(request, form),
    })
  }

  async routeEnabledTool(request: AIEnabledToolRouteRequest): Promise<AIEnabledToolRouteResult> {
    const candidates = request.enabledTools.filter(
      (tool) => tool.routingEnabled && tool.status === 'active',
    )
    const ranked = candidates
      .map((tool) => ({ score: routeScore(request.userMessage, tool), tool }))
      .sort((left, right) => right.score - left.score)
    const best = ranked[0]

    if (!best || best.score <= 0) {
      return AIEnabledToolRouteResultSchema.parse({
        confidence: 0,
        matchedProjectId: null,
        needsConfirmation: true,
        reason: 'No active tool matched the message.',
        rewrittenInstruction: request.userMessage,
      })
    }

    return AIEnabledToolRouteResultSchema.parse({
      confidence: Math.min(0.95, 0.45 + best.score / 20),
      matchedProjectId: best.tool.projectId,
      needsConfirmation: true,
      reason: `Matched ${best.tool.instanceAlias} by alias, tool name, or route tags.`,
      rewrittenInstruction: request.userMessage,
    })
  }

  async continueConversation(
    messages: AIConversationMessage[],
    context: AICalendarContext,
    conversationContext?: AIConversationContext,
  ): Promise<AIConversationResult> {
    const latest = messages[messages.length - 1]?.content.trim() ?? ''
    const lower = latest.toLowerCase()
    const wantsSchedulablePlan =
      /\b(schedule|calendar|plan|add|create|time|tomorrow|today|date)\b/i.test(latest)

    if (conversationContext?.kind === 'todo-step-refinement') {
      const selected = conversationContext.selectedItems
      const wantsRewrite =
        /\b(rewrite|refine|edit|change|improve|simplify|split|shorten|clarify)\b/i.test(latest)

      if (wantsSchedulablePlan) {
        return {
          reply: `Created a draft calendar plan for ${selected.length} selected item${
            selected.length === 1 ? '' : 's'
          }. Review it before applying.`,
          actionPlan: this.planSelectedTodoSteps(conversationContext, context),
        }
      }

      if (!wantsRewrite) {
        return {
          reply: [
            `I have ${selected.length} selected step${selected.length === 1 ? '' : 's'} from "${conversationContext.todoTitle}".`,
            'What should change: wording, order, scope, due-time detail, or level of detail?',
          ].join('\n'),
        }
      }

      return {
        reply: [
          `Suggested edits for "${conversationContext.todoTitle}":`,
          ...selected.map((item) => {
            const prefix = `${item.itemLabel} ${item.itemIndex + 1}`
            const revised = localRefinedStepText(item.value, lower)
            return `${prefix}: ${revised}`
          }),
          '',
          'Review these suggestions, then apply the wording in the Todo step editor.',
        ].join('\n'),
      }
    }

    if (conversationContext?.kind === 'draft-action-plan') {
      if (!wantsSchedulablePlan && /\b(unclear|not sure|clarify|question)\b/i.test(latest)) {
        return {
          reply:
            'Which part of the draft should change: time, duration, order, title, or priority?',
        }
      }

      return {
        reply:
          'Kept the current draft available for review. Use Plan actions for precise local edits.',
        actionPlan: conversationContext.actionPlan,
      }
    }

    if (!latest || /\b(unclear|not sure|help|clarify)\b/i.test(latest)) {
      return { reply: 'What outcome, deadline, and constraints should I optimize for?' }
    }

    if (wantsSchedulablePlan) {
      return {
        reply: 'Created a draft action plan from this conversation. Review it before applying.',
        actionPlan: await this.planCalendarActions(latest, context),
      }
    }

    return {
      reply:
        'I can help clarify this. What part is uncertain: timing, task scope, priority, or the exact next action?',
    }
  }

  private planDiningToolSession(request: ToolSessionRequest): ToolSessionResult {
    const date = request.inputs.date || request.today
    const time = request.inputs.time || '19:00'
    const mealType = request.inputs.mealType || 'dinner'
    const cuisine = request.inputs.cuisine || 'meal'
    const guests = request.inputs.guests || 'guests'
    const locationPreference = request.inputs.locationPreference || 'restaurant'
    const diningStart = toISODateTimeFromTime(date, time, request)
    const isCooking = locationPreference === 'cook-at-home'

    return ToolSessionResultSchema.parse({
      summary: `Planned ${mealType} as individual calendar steps.`,
      events: [
        {
          title: isCooking ? `Shop for ${cuisine} ${mealType}` : `Confirm ${cuisine} ${mealType}`,
          description: request.inputs.dietaryNotes,
          displayDetails: [
            `Guests: ${guests}`,
            request.inputs.budget ? `Budget: ${request.inputs.budget}` : '',
            isCooking
              ? 'Prepare ingredients and confirm dietary constraints.'
              : 'Confirm reservation, route, and guest count.',
          ]
            .filter(Boolean)
            .join('\n'),
          startAt: addMinutes(diningStart, isCooking ? -180 : -120),
          endAt: addMinutes(diningStart, isCooking ? -120 : -90),
          allDay: false,
          eventTypeId: 'meal',
          color: '#c2410c',
        },
        {
          title: isCooking ? `Prep ${cuisine} ${mealType}` : `${cuisine} ${mealType}`,
          description: request.inputs.dietaryNotes,
          displayDetails: [
            `Meal type: ${mealType}`,
            `Guests: ${guests}`,
            request.inputs.dietaryNotes ? `Dietary notes: ${request.inputs.dietaryNotes}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          startAt: isCooking ? addMinutes(diningStart, -90) : diningStart,
          endAt: isCooking ? diningStart : addMinutes(diningStart, 90),
          allDay: false,
          eventTypeId: 'meal',
          color: '#c2410c',
        },
        {
          title: isCooking ? `Serve and cleanup ${mealType}` : `Post-${mealType} follow-up`,
          displayDetails: isCooking
            ? 'Serve food, pack leftovers, and clean the main prep area.'
            : 'Confirm payment, notes, and any follow-up plans with guests.',
          startAt: addMinutes(diningStart, 90),
          endAt: addMinutes(diningStart, 120),
          allDay: false,
          eventTypeId: 'meal',
          color: '#c2410c',
        },
      ],
      warnings: ['Local planner used. Review times before applying.'],
    })
  }

  private planWorkoutToolSession(request: ToolSessionRequest): ToolSessionResult {
    const startDate = request.inputs.startDate || request.today
    const startTime = request.inputs.startTime || '07:00'
    const goal = request.inputs.goal || 'Workout goal'
    const level = request.inputs.fitnessLevel || 'beginner'
    const durationMinutes = Math.min(180, Math.max(15, Number(request.inputs.sessionLength || 45)))
    const equipment = request.inputs.equipment || 'available equipment'
    const constraints = request.inputs.constraints || 'none listed'
    const heightCm = request.inputs.heightCm || request.inputs.height || ''
    const weightKg = request.inputs.weightKg || request.inputs.weight || ''
    const preferences = request.inputs.preferences || request.inputs.preference || ''
    const bodyMetrics = [
      heightCm ? `Height: ${heightCm} cm` : '',
      weightKg ? `Weight: ${weightKg} kg` : '',
    ]
      .filter(Boolean)
      .join(', ')

    const events = [0, 2, 4].map((dayOffset, index) => {
      const date = addDays(startDate, dayOffset)
      const startAt = toISODateTimeFromTime(date, startTime, request)
      return {
        title: `${goal} workout ${index + 1}`,
        description: `${level} session`,
        displayDetails: [
          `Goal: ${goal}`,
          `Level: ${level}`,
          `Equipment: ${equipment}`,
          `Constraints: ${constraints}`,
          bodyMetrics ? `Body metrics: ${bodyMetrics}` : '',
          preferences ? `Preferences: ${preferences}` : '',
          `Focus: ${index === 0 ? 'Foundation' : index === 1 ? 'Progression' : 'Review and repeatable routine'}`,
        ]
          .filter(Boolean)
          .join('\n'),
        startAt,
        endAt: addMinutes(startAt, durationMinutes),
        allDay: false,
        eventTypeId: 'project',
        color: '#2563eb',
      }
    })

    return ToolSessionResultSchema.parse({
      summary: `Planned ${events.length} individual workout sessions.`,
      events,
      warnings: ['Local planner used. Review intensity before applying.'],
    })
  }

  private planFitnessProgressTool(request: AIProgressToolRequest): AIProgressToolResult {
    const goal = request.formInput.goal || request.project?.title || 'Fitness demo goal'
    const level = request.formInput.level || 'beginner'
    const equipment = request.formInput.equipment || 'bodyweight'
    const constraints = request.formInput.constraints || 'none listed'
    const heightCm = request.formInput.heightCm || request.formInput.height || ''
    const weightKg = request.formInput.weightKg || request.formInput.weight || ''
    const preferences = request.formInput.preferences || request.formInput.preference || ''
    const bodyMetrics = [
      heightCm ? `Height: ${heightCm} cm` : '',
      weightKg ? `Weight: ${weightKg} kg` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const profileDetails = [
      bodyMetrics ? `Body metrics: ${bodyMetrics}` : '',
      preferences ? `Preferences: ${preferences}` : '',
    ].filter(Boolean)
    const lowImpactRequested =
      /\b(low impact|no jumping|pain|injury|doctor|medical|knee|back|shoulder)\b/i.test(
        [constraints, preferences].join(' '),
      )
    const workoutEnergy = lowImpactRequested ? 'medium' : 'high'
    const frequency = request.formInput.frequency || '3 times per week'
    const durationMinutes = Math.min(
      120,
      Math.max(20, Number(request.formInput.sessionLength || 45)),
    )
    const preferredTime = request.formInput.preferredTime || '07:00'
    const latestMessage = latestProgressToolMessage(request)
    const fullWeekRequested = latestMessage ? isFullWeekRequest(latestMessage) : false
    const startDate = fullWeekRequested ? nextWeekday(request.today, 1) : request.today
    const sessionCount = clampSessionCount(
      parseRequestedSessionCount(latestMessage) ??
        parseRequestedSessionCount(frequency) ??
        (fullWeekRequested ? 5 : 2),
    )
    const scheduledSessions = sessionOffsets(sessionCount).map((offset, index) => {
      const date = addDays(startDate, offset)
      const block = nextNonConflictingStart(date, preferredTime, durationMinutes, request)
      return { ...block, date, index }
    })
    const warnings = ['Local planner used. Review intensity and timing before applying.']

    if (scheduledSessions.some((session) => session.shifted)) {
      warnings.push('Adjusted one or more workout blocks to avoid supplied calendar conflicts.')
    }

    if (lowImpactRequested) {
      warnings.push(
        'Fitness constraints mention possible injury or medical concerns. Keep the demo plan conservative and seek professional guidance when needed.',
      )
    }

    return AIProgressToolResultSchema.parse({
      assistantReply:
        latestMessage && !isAutomaticRequirementConfirmation(latestMessage)
          ? `Confirmed: ${latestMessage}. I updated the workout plan, next actions, and progress log.`
          : `Confirmed ${goal}: ${level}, ${frequency}, ${durationMinutes} minute sessions.`,
      confirmedRequirements: [
        `Goal: ${goal}`,
        `Level: ${level}`,
        `Equipment: ${equipment}`,
        `Frequency: ${frequency}`,
        `Calendar sessions: ${sessionCount}`,
        `Session length: ${durationMinutes} minutes`,
        bodyMetrics ? `Body metrics: ${bodyMetrics}` : '',
        preferences ? `Preferences: ${preferences}` : '',
      ].filter(Boolean),
      summary: `Built a ${frequency} ${level} fitness plan for ${goal} with ${sessionCount} calendar session${sessionCount === 1 ? '' : 's'}.`,
      currentRecommendation: `Next session: ${durationMinutes} minutes focused on ${goal}, using ${equipment}. Preview includes ${sessionCount} session${sessionCount === 1 ? '' : 's'} starting ${startDate}.`,
      milestones: [
        {
          title: 'Baseline and habit setup',
          description: 'Confirm constraints, warm-up routine, and repeatable schedule.',
          dueDate: addDays(startDate, 7),
          status: request.milestones.length ? 'in_progress' : 'not_started',
        },
        {
          title: 'Progressive training rhythm',
          description: `Complete consistent ${frequency} sessions with controlled progression.`,
          dueDate: addDays(startDate, 21),
          status: 'not_started',
        },
        {
          title: 'Review and adjust plan',
          description: 'Review adherence, recovery, and next cycle priorities.',
          dueDate: addDays(startDate, 28),
          status: 'not_started',
        },
      ],
      actions: [
        ...scheduledSessions.map((session) => ({
          title:
            session.index === 0
              ? 'Complete baseline workout'
              : `Complete workout session ${session.index + 1}`,
          description: [
            `Level: ${level}. Equipment: ${equipment}. Constraints: ${constraints}.`,
            ...profileDetails,
          ].join(' '),
          dueDate: session.date,
          energyNeeded: workoutEnergy,
          estimatedMinutes: durationMinutes,
          milestoneTitle:
            session.index === 0 ? 'Baseline and habit setup' : 'Progressive training rhythm',
          priority: session.index === 0 ? 'high' : 'medium',
          status: 'scheduled' as const,
        })),
        {
          title: 'Log recovery and effort',
          description: [
            'Record effort, soreness, and any constraint notes after the first session.',
            preferences ? `Preferences to review: ${preferences}.` : '',
          ]
            .filter(Boolean)
            .join(' '),
          dueDate: startDate,
          energyNeeded: 'low',
          estimatedMinutes: 15,
          milestoneTitle: 'Baseline and habit setup',
          priority: 'medium',
          status: 'todo',
        },
      ],
      progressLog: {
        details: `Inputs: ${JSON.stringify(request.formInput)}. ${
          latestMessage && !isAutomaticRequirementConfirmation(latestMessage)
            ? `Conversation: ${latestMessage}. `
            : ''
        }Calendar context contained ${request.calendarEvents.length} event(s).`,
        logType: 'tool_result',
        summary:
          latestMessage && !isAutomaticRequirementConfirmation(latestMessage)
            ? 'Updated local fitness progress plan from conversation.'
            : 'Generated a local fitness progress plan.',
      },
      calendarEvents: scheduledSessions.map((session) => {
        const focus =
          session.index === 0
            ? 'baseline form, warm-up, and sustainable pace'
            : session.index === scheduledSessions.length - 1
              ? 'review, recovery, and repeatable routine'
              : 'controlled progression without increasing intensity too quickly'

        return {
          title:
            session.index === 0
              ? `${goal} baseline workout`
              : `${goal} workout session ${session.index + 1}`,
          description: `Fitness AI demo plan for ${level}.`,
          displayDetails: [
            `Goal: ${goal}`,
            `Equipment: ${equipment}`,
            `Constraints: ${constraints}`,
            bodyMetrics ? `Body metrics: ${bodyMetrics}` : '',
            preferences ? `Preferences: ${preferences}` : '',
            `Focus: ${focus}.`,
          ]
            .filter(Boolean)
            .join('\n'),
          startAt: session.startAt,
          endAt: addMinutes(session.startAt, durationMinutes),
          allDay: false as const,
          eventTypeId: 'project',
          color: '#2563eb',
        }
      }),
      warnings,
    })
  }

  private planAgentLearningProgressTool(request: AIProgressToolRequest): AIProgressToolResult {
    const goal = request.formInput.goal || request.project?.title || 'Learn AI agent skills'
    const level = request.formInput.level || 'beginner'
    const weeklyTime = request.formInput.weeklyTime || '3 hours per week'
    const outcome = request.formInput.outcome || 'ship a small agent demo'
    const preferredTime = request.formInput.preferredTime || '19:00'
    const durationMinutes = 60
    const routeKind = learningRouteKindFromInput(request)
    const routeLabel = learningRouteLabel(routeKind)
    const latestMessage = latestProgressToolMessage(request)
    const fullWeekRequested = latestMessage ? isFullWeekRequest(latestMessage) : false
    const startDate = fullWeekRequested ? nextWeekday(request.today, 1) : request.today
    const sessionCount = clampSessionCount(
      parseRequestedSessionCount(latestMessage) ??
        (fullWeekRequested ? (parseRequestedSessionCount(weeklyTime) ?? 5) : 1),
    )
    const scheduledSessions = sessionOffsets(sessionCount).map((offset, index) => {
      const date = addDays(startDate, offset)
      const block = nextNonConflictingStart(date, preferredTime, durationMinutes, request)
      return { ...block, date, index }
    })
    const warnings = ['Local planner used. Review learning scope before applying.']

    if (scheduledSessions.some((session) => session.shifted)) {
      warnings.push('Adjusted the next learning block to avoid supplied calendar conflicts.')
    }

    return AIProgressToolResultSchema.parse({
      assistantReply:
        latestMessage && !isAutomaticRequirementConfirmation(latestMessage)
          ? `Confirmed: ${latestMessage}. I updated the learning route, next lesson, and progress log.`
          : `Confirmed ${routeLabel} learning for ${goal}: ${level}, ${weeklyTime}, target outcome ${outcome}.`,
      confirmedRequirements: [
        `Goal: ${goal}`,
        `Route: ${routeLabel}`,
        `Level: ${level}`,
        `Weekly time: ${weeklyTime}`,
        `Calendar sessions: ${sessionCount}`,
        `Outcome: ${outcome}`,
      ],
      summary: `Built ${learningRouteArticle(routeKind)} ${routeLabel} learning route toward ${outcome} with ${sessionCount} calendar session${sessionCount === 1 ? '' : 's'}.`,
      currentRecommendation: `Start with ${routeLabel} foundations and a small working loop. For ${level} level and ${weeklyTime}, preview includes ${sessionCount} learning block${sessionCount === 1 ? '' : 's'} starting ${startDate}.`,
      milestones: learningMilestones(
        routeKind,
        outcome,
        request.today,
        Boolean(request.milestones.length),
      ),
      actions: scheduledSessions.map((session) => {
        const lesson = learningSessionTopic(session.index, outcome, goal, routeKind)
        return {
          title: lesson.actionTitle,
          description: lesson.description,
          dueDate: session.date,
          milestoneTitle: lesson.milestoneTitle,
          status: 'scheduled' as const,
        }
      }),
      progressLog: {
        details: `Inputs: ${JSON.stringify(request.formInput)}. ${
          latestMessage && !isAutomaticRequirementConfirmation(latestMessage)
            ? `Conversation: ${latestMessage}. `
            : ''
        }Search context: ${request.memorySearchResults.map((result) => result.title).join(', ')}`,
        logType: 'tool_result',
        summary:
          latestMessage && !isAutomaticRequirementConfirmation(latestMessage)
            ? `Updated local ${routeLabel} learning route from conversation.`
            : `Generated a local ${routeLabel} learning route.`,
      },
      calendarEvents: scheduledSessions.map((session) => {
        const lesson = learningSessionTopic(session.index, outcome, goal, routeKind)
        return {
          title: lesson.eventTitle,
          description: `Learning route for ${goal}.`,
          displayDetails: [
            `Level: ${level}`,
            `Weekly time: ${weeklyTime}`,
            `Outcome: ${outcome}`,
            `Focus: ${lesson.focus}.`,
          ].join('\n'),
          startAt: session.startAt,
          endAt: addMinutes(session.startAt, durationMinutes),
          allDay: false as const,
          eventTypeId: 'project',
          color: '#047857',
        }
      }),
      warnings,
    })
  }

  private planEventAction(
    command: string,
    context: AICalendarContext,
    event?: AICalendarContext['events'][number],
  ): AICalendarActionPlan {
    if (event && /\b(delete|remove|cancel)\b/i.test(command)) {
      return AICalendarActionPlanSchema.parse({
        summary: `Delete event "${event.title}".`,
        actions: [{ type: 'delete_event', eventId: event.id, reason: 'Matched by title.' }],
      })
    }

    if (event && /\b(update|edit|rename|move|change)\b/i.test(command)) {
      const durationMinutes = parseDurationMinutes(command)
      const startAt = parseCommandStartAt(command, context)
      const changes = {
        ...(renamedTitle(command) ? { title: renamedTitle(command) } : {}),
        ...(/\b(move|reschedule|change)\b/i.test(command)
          ? {
              startAt,
              endAt: addMinutes(startAt, durationMinutes),
            }
          : {}),
      }

      return AICalendarActionPlanSchema.parse({
        summary: `Update event "${event.title}".`,
        actions: [
          { type: 'update_event', eventId: event.id, changes, reason: 'Matched by title.' },
        ],
      })
    }

    const durationMinutes = parseDurationMinutes(command)
    const startAt = parseCommandStartAt(command, context)

    return AICalendarActionPlanSchema.parse({
      summary: 'Create a calendar event.',
      actions: [
        {
          type: 'create_event',
          title: bestTitle(command, 'New event'),
          startAt,
          endAt: addMinutes(startAt, durationMinutes),
          allDay: false,
          eventTypeId: eventTypeIdFromCommand(command, context),
          reason: 'Local fallback inferred a time-bound calendar item.',
        },
      ],
      warnings: ['Local planner used. Review dates and times before applying.'],
    })
  }

  private planTodoAction(
    command: string,
    context: AICalendarContext,
    todo?: AICalendarContext['todos'][number],
  ): AICalendarActionPlan {
    if (todo && /\b(delete|remove)\b/i.test(command)) {
      return AICalendarActionPlanSchema.parse({
        summary: `Delete task "${todo.title}".`,
        actions: [{ type: 'delete_todo', todoId: todo.id, reason: 'Matched by title.' }],
      })
    }

    if (todo && /\b(schedule|calendar)\b/i.test(command)) {
      const explicitStartAt = hasExplicitTime(command)
        ? parseCommandStartAt(command, context)
        : undefined
      return AICalendarActionPlanSchema.parse({
        summary: `Schedule task "${todo.title}".`,
        actions: [
          {
            type: 'schedule_todo',
            todoId: todo.id,
            date: parseDate(command, context.currentDate ?? context.today),
            startAt: explicitStartAt,
            endAt: explicitStartAt ? addMinutes(explicitStartAt, todo.etaMinutes) : undefined,
            reason: 'Matched by title.',
          },
        ],
      })
    }

    if (todo && /\b(complete|done|finish)\b/i.test(command)) {
      return AICalendarActionPlanSchema.parse({
        summary: `Mark task "${todo.title}" done.`,
        actions: [
          {
            type: 'update_todo',
            todoId: todo.id,
            changes: { status: 'done' },
            reason: 'Completion command matched by title.',
          },
        ],
      })
    }

    if (todo && /\b(update|edit|rename|change)\b/i.test(command)) {
      return AICalendarActionPlanSchema.parse({
        summary: `Update task "${todo.title}".`,
        actions: [
          {
            type: 'update_todo',
            todoId: todo.id,
            changes: { title: renamedTitle(command) ?? todo.title },
            reason: 'Matched by title.',
          },
        ],
      })
    }

    return AICalendarActionPlanSchema.parse({
      summary: 'Create a task.',
      actions: [
        {
          type: 'create_todo',
          title: bestTitle(command, 'New task'),
          dueDate: parseDate(command, context.currentDate ?? context.today),
          energyNeeded: taskEnergyNeededFromCommand(command),
          etaMinutes: taskEtaMinutesFromCommand(command),
          priority: /urgent|important|high/i.test(command) ? 'high' : 'medium',
          eventTypeId: eventTypeIdFromCommand(command, context),
          reason: 'Local fallback inferred a task.',
        },
      ],
      warnings: ['Local planner used. Review the task before applying.'],
    })
  }

  private planSelectedTodoSteps(
    conversationContext: Extract<AIConversationContext, { kind: 'todo-step-refinement' }>,
    context: AICalendarContext,
  ): AICalendarActionPlan {
    const baseDate = parseDate(
      conversationContext.selectedItems.map((item) => item.value).join(' '),
      context.currentDate ?? context.today,
    )
    const actions = conversationContext.selectedItems.map((item, index) => {
      const date = addDays(baseDate, index)
      const hour = Math.min(17, 9 + index)
      const startAt = toISODateTime(date, hour, 0, context)

      return {
        type: 'create_event' as const,
        title: item.value,
        description: `From task "${conversationContext.todoTitle}", ${item.itemLabel.toLowerCase()} ${
          item.itemIndex + 1
        }.`,
        startAt,
        endAt: addMinutes(startAt, 45),
        allDay: false,
        reason: 'Local conversation converted selected task step into a draft calendar event.',
      }
    })

    return AICalendarActionPlanSchema.parse({
      summary: `Schedule selected steps from "${conversationContext.todoTitle}".`,
      actions,
      warnings: ['Local planner used. Review dates and times before applying.'],
    })
  }
}

function localRefinedStepText(value: string, instruction: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()

  if (instruction.includes('shorten'))
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned
  if (instruction.includes('simplify')) return `Clarify the next action for: ${cleaned}`
  if (instruction.includes('split')) return `Break into smaller follow-up tasks: ${cleaned}`

  return `Refine and confirm: ${cleaned}`
}
