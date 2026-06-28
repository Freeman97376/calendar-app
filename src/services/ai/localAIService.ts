import {
  AIBreakdownResultSchema,
  AICalendarActionPlanSchema,
} from '../../domain/schemas/ai.schema'
import { ToolSessionResultSchema } from '../../domain/schemas/toolSession.schema'
import type {
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
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
  timezoneOffsetMinutes?: number
  today?: string
}

function toISODateTime(date: string, hour: number, minute = 0, context?: TimezoneContext): string {
  const [year, month, day] = date.split('-').map(Number)
  if (typeof context?.timezoneOffsetMinutes === 'number') {
    const utcTime = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - context.timezoneOffsetMinutes * 60_000

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

  const now = 'today' in context ? currentDateTimeFromContext(context as AICalendarContext) : new Date()

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

function parseTime(command: string, context: AICalendarContext, date: string): { hour: number; minute: number } {
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
    .replace(/\b(later today|today|tomorrow|tonight|soon|later|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
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
          suggestedDayOffset: 0,
          suggestedHour: 9,
          priority: isProject ? 'high' : 'medium',
        },
        ...(isProject
          ? [
              {
                title: `Execute ${title}`,
                durationMinutes: 60,
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
      return todo ? this.planTodoAction(command, context, todo) : this.planEventAction(command, context, event)
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

  async continueConversation(
    messages: AIConversationMessage[],
    context: AICalendarContext,
    conversationContext?: AIConversationContext,
  ): Promise<AIConversationResult> {
    const latest = messages[messages.length - 1]?.content.trim() ?? ''
    const lower = latest.toLowerCase()
    const wantsSchedulablePlan = /\b(schedule|calendar|plan|add|create|time|tomorrow|today|date)\b/i.test(
      latest,
    )

    if (conversationContext?.kind === 'todo-step-refinement') {
      const selected = conversationContext.selectedItems
      const wantsRewrite = /\b(rewrite|refine|edit|change|improve|simplify|split|shorten|clarify)\b/i.test(
        latest,
      )

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
          reply: 'Which part of the draft should change: time, duration, order, title, or priority?',
        }
      }

      return {
        reply: 'Kept the current draft available for review. Use Plan actions for precise local edits.',
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
      reply: 'I can help clarify this. What part is uncertain: timing, task scope, priority, or the exact next action?',
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
            isCooking ? 'Prepare ingredients and confirm dietary constraints.' : 'Confirm reservation, route, and guest count.',
          ].filter(Boolean).join('\n'),
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
          ].filter(Boolean).join('\n'),
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
          `Focus: ${index === 0 ? 'Foundation' : index === 1 ? 'Progression' : 'Review and repeatable routine'}`,
        ].join('\n'),
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
        actions: [{ type: 'update_event', eventId: event.id, changes, reason: 'Matched by title.' }],
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
      return AICalendarActionPlanSchema.parse({
        summary: `Schedule task "${todo.title}".`,
        actions: [
          {
            type: 'schedule_todo',
            todoId: todo.id,
            date: parseDate(command, context.currentDate ?? context.today),
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

  if (instruction.includes('shorten')) return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned
  if (instruction.includes('simplify')) return `Clarify the next action for: ${cleaned}`
  if (instruction.includes('split')) return `Break into smaller follow-up tasks: ${cleaned}`

  return `Refine and confirm: ${cleaned}`
}
