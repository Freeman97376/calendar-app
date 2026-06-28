import { z } from 'zod'

import {
  AIBreakdownResultSchema,
  AICalendarActionPlanSchema,
  AIConversationResultSchema,
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

export const DEFAULT_AI_API_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_AI_API_MODEL = 'deepseek-chat'

const defaultFetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)

const breakdownSystemPrompt = `You are a productivity assistant helping users schedule their goals.
Return only a JSON object matching the requested schema.
Break each goal into 2-8 concrete, actionable steps that can be scheduled as calendar events.
Use only the documented keys. Omit optional fields instead of returning null.
Use lowercase priority values: high, medium, or low.`

const actionSystemPrompt = `You are a calendar and task assistant.
Return only a JSON object matching the requested schema.
Use only event and todo ids that appear in the supplied context for update/delete/schedule actions.
Interpret "today", "tomorrow", "this week", "tonight", "soon", and similar relative phrases from the authoritative local time context.currentLocalDateTime/context.currentDateTime in context.timezone, context.timezoneName, and context.timezoneOffsetLabel, not from context.focusedDate.
context.focusedDate is only the calendar view the user is looking at.
For user-specified wall-clock times, preserve the local time in context.timezone. Prefer local datetime strings like 2026-06-18T19:00:00, or include the correct timezone offset. Do not output 2026-06-18T19:00:00Z for 7pm local time unless the user's timezone is UTC.
If the user does not specify a wall-clock time, do not default to 7pm. For near-term commands, start from context.currentLocalDateTime rounded up to the next practical 30-minute boundary, or add a warning explaining that the time was inferred.
Do not create duplicate or overlapping event time blocks. If requested work cannot fit without overlap, add a warning instead of reusing the same time range.
Use ISO date strings for todo dueDate or schedule dates, for example 2026-06-18.
If an event starts within the next 48 hours, add a warning beginning with "Confirm time:" that repeats the interpreted local time.
When the user asks for a new project/task, create a todo unless they clearly ask for a calendar event.
When the user asks for dinner, meetings, appointments, or time-bound commitments, create a calendar event.
Do not invent event type ids; use an id from context.eventTypes or omit it.
Use only the documented keys. Omit optional fields instead of returning null.`

const toolSessionSystemPrompt = `You are a configurable calendar planning tool.
Return only a JSON object matching the requested output schema.
Each generated item must be an individual calendar event, not a combined block.
Use displayDetails for the expanded calendar text users can inspect later.
For user-specified wall-clock times, preserve the local time in the request timezone. Prefer local datetime strings like 2026-06-18T19:00:00, or include the correct timezone offset. Do not output 2026-06-18T19:00:00Z for 7pm local time unless the user's timezone is UTC.
Preserve the user's requested date/time constraints.
Do not create duplicate or overlapping event time blocks.
Use only the documented keys. Omit optional fields instead of returning null.`

const conversationSystemPrompt = `You are the calendar app's conversational planning assistant.
Return only a JSON object matching the requested schema.
Use this conversation to clarify and adjust draft plans before the user applies them to the calendar.
Every conversation is scoped to the supplied task context only. Do not use assumptions from other tasks or prior unrelated requests.
If the user's request is unclear, set "reply" to 1-3 specific follow-up questions and omit "actionPlan".
If enough details are available to schedule or update calendar/tasks, include "actionPlan" with explicit actions the UI can review and apply.
When todo steps are provided, convert selected unfinished or requested steps into schedulable calendar events or task actions when the user asks to plan/schedule/add them.
When a draft action plan is provided, adjust that draft rather than inventing a new unrelated plan.
Use the authoritative local time context for relative dates and near-term time questions.
Do not create duplicate or overlapping event time blocks. Add warnings when details are inferred.
Use only event and todo ids that appear in the supplied context for update/delete/schedule actions.
Use only the documented keys. Omit optional fields instead of returning null.`

const breakdownJsonShape = `{
  "goal": "string",
  "steps": [
    {
      "title": "string",
      "description": "optional string",
      "durationMinutes": 30,
      "suggestedDayOffset": 0,
      "suggestedHour": 9,
      "priority": "high | medium | low"
    }
  ],
  "totalEstimatedHours": 1,
  "notes": "optional string"
}`

const actionJsonShape = `{
  "summary": "string",
  "actions": [
    {
      "type": "create_event",
      "title": "string",
      "description": "optional string",
      "displayDetails": "optional string",
      "startAt": "ISO datetime",
      "endAt": "ISO datetime",
      "allDay": false,
      "eventTypeId": "optional existing event type id",
      "reason": "optional string"
    },
    {
      "type": "update_event",
      "eventId": "existing event id",
      "changes": { "title": "optional string", "startAt": "optional ISO datetime", "endAt": "optional ISO datetime" },
      "reason": "optional string"
    },
    {
      "type": "delete_event",
      "eventId": "existing event id",
      "reason": "optional string"
    },
    {
      "type": "create_todo",
      "title": "string",
      "notes": "optional string",
      "dueDate": "optional ISO date",
      "priority": "high | medium | low",
      "eventTypeId": "optional existing event type id",
      "reason": "optional string"
    },
    {
      "type": "update_todo",
      "todoId": "existing todo id",
      "changes": { "title": "optional string", "dueDate": "optional ISO date", "priority": "optional high | medium | low", "status": "optional todo | doing | done" },
      "reason": "optional string"
    },
    {
      "type": "delete_todo",
      "todoId": "existing todo id",
      "reason": "optional string"
    },
    {
      "type": "schedule_todo",
      "todoId": "existing todo id",
      "date": "optional ISO date",
      "reason": "optional string"
    }
  ],
  "warnings": []
}`

const toolSessionJsonShape = `{
  "summary": "string",
  "events": [
    {
      "title": "string",
      "description": "optional string",
      "displayDetails": "optional string",
      "startAt": "ISO datetime",
      "endAt": "ISO datetime",
      "allDay": false,
      "eventTypeId": "optional string",
      "color": "optional string"
    }
  ],
  "warnings": []
}`

const conversationJsonShape = `{
  "reply": "string",
  "actionPlan": {
    "summary": "optional string when enough details are available",
    "actions": [
      {
        "type": "create_event",
        "title": "string",
        "description": "optional string",
        "displayDetails": "optional string",
        "startAt": "ISO datetime",
        "endAt": "ISO datetime",
        "allDay": false,
        "eventTypeId": "optional existing event type id",
        "reason": "optional string"
      }
    ],
    "warnings": []
  }
}`

type ApiAIServiceOptions = {
  apiKey?: string
  baseUrl?: string
  fetcher?: typeof fetch
  model?: string
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  error?: string | { message?: string }
}

export class ApiAIService implements IAIService {
  private readonly apiKey: string
  private readonly endpoint: string
  private readonly fetcher: typeof fetch
  readonly model: string

  constructor(options: ApiAIServiceOptions = {}) {
    this.apiKey = options.apiKey ?? import.meta.env.VITE_AI_API_KEY ?? import.meta.env.VITE_DEEPSEEK_API_KEY ?? ''
    this.endpoint = chatCompletionsEndpoint(
      options.baseUrl ??
        import.meta.env.VITE_AI_API_BASE_URL ??
        import.meta.env.VITE_DEEPSEEK_BASE_URL ??
        DEFAULT_AI_API_BASE_URL,
    )
    this.fetcher = options.fetcher ?? defaultFetcher
    this.model =
      options.model ?? import.meta.env.VITE_AI_API_MODEL ?? import.meta.env.VITE_DEEPSEEK_MODEL ?? DEFAULT_AI_API_MODEL
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey)
  }

  async breakdownGoal(goal: string): Promise<AIBreakdownResult> {
    return this.callJson(
      AIBreakdownResultSchema,
      breakdownSystemPrompt,
      ['Return JSON matching this shape:', breakdownJsonShape, '', `Goal: ${goal}`].join('\n'),
      1024,
      undefined,
      normalizeBreakdownOutput,
    )
  }

  async planCalendarActions(
    command: string,
    context: AICalendarContext,
  ): Promise<AICalendarActionPlan> {
    return this.callJson(
      AICalendarActionPlanSchema as z.ZodType<AICalendarActionPlan>,
      actionSystemPrompt,
      [
        'Authoritative local time context:',
        formatRequestTimeContext(context),
        '',
        'Return JSON matching this shape:',
        actionJsonShape,
        'Allowed action types: create_event, update_event, delete_event, create_todo, update_todo, delete_todo, schedule_todo.',
        '',
        JSON.stringify({ command, context }, null, 2),
      ].join('\n'),
      2048,
      undefined,
      normalizeActionPlanOutput,
    )
  }

  async runToolSession(request: ToolSessionRequest): Promise<ToolSessionResult> {
    return this.callJson(
      ToolSessionResultSchema as z.ZodType<ToolSessionResult>,
      toolSessionSystemPrompt,
      [
        'Authoritative local time context:',
        formatRequestTimeContext(request),
        '',
        'Return JSON matching this shape:',
        toolSessionJsonShape,
        '',
        JSON.stringify(request, null, 2),
      ].join('\n'),
      2048,
      request.llmOptions.model,
      normalizeToolSessionOutput,
    )
  }

  async continueConversation(
    messages: AIConversationMessage[],
    context: AICalendarContext,
    conversationContext?: AIConversationContext,
  ): Promise<AIConversationResult> {
    return this.callJson(
      AIConversationResultSchema as z.ZodType<AIConversationResult>,
      conversationSystemPrompt,
      [
        'Authoritative local time context:',
        formatRequestTimeContext(context),
        '',
        'Return JSON matching this shape:',
        conversationJsonShape,
        '',
        conversationContext ? 'Conversation task context:' : '',
        conversationContext ? JSON.stringify(conversationContext, null, 2) : '',
        '',
        'Calendar app context:',
        JSON.stringify({ context }, null, 2),
        '',
        'Conversation messages:',
        JSON.stringify(messages.slice(-12), null, 2),
      ]
        .filter(Boolean)
        .join('\n'),
      2048,
      undefined,
      normalizeConversationOutput,
    )
  }

  private async callJson<T>(
    schema: z.ZodType<T>,
    system: string,
    content: string,
    maxTokens = 1024,
    modelOverride?: string,
    normalize?: (value: unknown) => unknown,
  ): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error('AI API key is not configured. Add VITE_AI_API_KEY or VITE_DEEPSEEK_API_KEY to .env.local or Settings.')
    }

    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelOverride?.trim() || this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const message = await readResponseMessage(response)
      throw new Error(`AI API request failed with status ${response.status}${message ? `: ${message}` : ''}`)
    }

    const body = await parseResponseJson<ChatCompletionResponse>(
      response,
      'AI API response was malformed and could not be read as JSON.',
    )
    const text = body.choices?.[0]?.message?.content?.trim()

    if (!text) {
      throw new Error('AI API returned an empty model response.')
    }

    return parseStructuredOutput(schema, text, normalize)
  }
}

export function chatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}

async function parseResponseJson<T>(response: Response, message: string): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new Error(message)
  }
}

async function readResponseMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return ''

  try {
    const payload = JSON.parse(text) as ChatCompletionResponse
    if (typeof payload.error === 'string') return payload.error
    if (payload.error?.message) return payload.error.message
  } catch {
    return text.slice(0, 300)
  }

  return text.slice(0, 300)
}

function parseStructuredOutput<T>(
  schema: z.ZodType<T>,
  text: string,
  normalize?: (value: unknown) => unknown,
): T {
  let parsed = parseJsonObjectText(text)

  if (normalize) parsed = normalize(parsed)

  try {
    return schema.parse(parsed)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`AI API response failed schema validation: ${formatZodIssues(error)}`)
    }

    throw error
  }
}

function parseJsonObjectText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
      } catch {
        throw new Error('AI API returned invalid JSON.')
      }
    }

    throw new Error('AI API returned invalid JSON.')
  }
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.length ? issue.path.join('.') : 'root'}: ${issue.message}`)
    .join('; ')
}

function formatRequestTimeContext(value: {
  currentDate?: string
  currentDateTime?: string
  currentLocalDateTime?: string
  focusedDate?: string
  locale?: string
  localDateTimeLabel?: string
  timezone?: string
  timezoneName?: string
  timezoneOffsetLabel?: string
  timezoneOffsetMinutes?: number
  today?: string
}): string {
  return JSON.stringify(
    {
      currentDate: value.currentDate ?? value.today,
      currentDateTime: value.currentDateTime,
      currentLocalDateTime: value.currentLocalDateTime,
      focusedDate: value.focusedDate,
      locale: value.locale,
      localDateTimeLabel: value.localDateTimeLabel,
      today: value.today,
      timezone: value.timezone,
      timezoneName: value.timezoneName,
      timezoneOffsetLabel: value.timezoneOffsetLabel,
      timezoneOffsetMinutes: value.timezoneOffsetMinutes,
    },
    null,
    2,
  )
}

function normalizeBreakdownOutput(value: unknown): unknown {
  const output = unwrapStructuredOutput(value)
  if (!isRecord(output)) return output

  return compactUndefined({
    ...output,
    steps: Array.isArray(output.steps)
      ? output.steps.map((step) => {
          if (!isRecord(step)) return step
          return compactUndefined({
            ...step,
            description: optionalString(step.description),
            durationMinutes: numberFromUnknown(step.durationMinutes),
            priority: enumLowercase(step.priority),
            suggestedDayOffset: numberFromUnknown(step.suggestedDayOffset),
            suggestedHour: numberFromUnknown(step.suggestedHour),
          })
        })
      : output.steps,
    notes: optionalString(output.notes),
    totalEstimatedHours: numberFromUnknown(output.totalEstimatedHours),
  })
}

function normalizeActionPlanOutput(value: unknown): unknown {
  const output = unwrapStructuredOutput(value)
  if (!isRecord(output)) return output

  return compactUndefined({
    ...output,
    actions: Array.isArray(output.actions) ? output.actions.map(normalizeAction) : output.actions,
    warnings: normalizeWarnings(output.warnings),
  })
}

function normalizeToolSessionOutput(value: unknown): unknown {
  const output = unwrapStructuredOutput(value)
  if (!isRecord(output)) return output

  return compactUndefined({
    ...output,
    events: Array.isArray(output.events) ? output.events.map(normalizeEventLike) : output.events,
    warnings: normalizeWarnings(output.warnings),
  })
}

function normalizeConversationOutput(value: unknown): unknown {
  const output = unwrapStructuredOutput(value)
  if (!isRecord(output)) return output

  return compactUndefined({
    ...output,
    actionPlan: output.actionPlan ? normalizeActionPlanOutput(output.actionPlan) : undefined,
    reply: optionalString(output.reply),
  })
}

function normalizeAction(value: unknown): unknown {
  if (!isRecord(value)) return value

  const base = {
    ...value,
    description: optionalString(value.description),
    displayDetails: optionalString(value.displayDetails),
    dueDate: optionalDate(value.dueDate),
    eventTypeId: optionalString(value.eventTypeId),
    notes: optionalString(value.notes),
    priority: enumLowercase(value.priority),
    reason: optionalString(value.reason),
  }

  if (value.type === 'create_event') return normalizeEventLike(base)
  if (value.type === 'create_todo') return compactUndefined(base)
  if (value.type === 'schedule_todo') return compactUndefined({ ...base, date: optionalDate(value.date) })

  if ((value.type === 'update_event' || value.type === 'update_todo') && isRecord(value.changes)) {
    return compactUndefined({
      ...base,
      changes: normalizeChanges(value.changes),
    })
  }

  return compactUndefined(base)
}

function normalizeChanges(changes: Record<string, unknown>): Record<string, unknown> {
  return compactUndefined({
    ...changes,
    description: optionalString(changes.description),
    displayDetails: optionalString(changes.displayDetails),
    dueDate: optionalDate(changes.dueDate),
    endAt: optionalDateTime(changes.endAt),
    eventTypeId: optionalString(changes.eventTypeId),
    notes: optionalString(changes.notes),
    priority: enumLowercase(changes.priority),
    startAt: optionalDateTime(changes.startAt),
    status: enumLowercase(changes.status),
  })
}

function normalizeEventLike(value: unknown): unknown {
  if (!isRecord(value)) return value

  return compactUndefined({
    ...value,
    allDay: booleanFromUnknown(value.allDay),
    color: optionalString(value.color),
    description: optionalString(value.description),
    displayDetails: optionalString(value.displayDetails),
    endAt: optionalDateTime(value.endAt),
    eventTypeId: optionalString(value.eventTypeId),
    reason: optionalString(value.reason),
    startAt: optionalDateTime(value.startAt),
  })
}

function unwrapStructuredOutput(value: unknown): unknown {
  if (!isRecord(value)) return value

  for (const key of ['result', 'data', 'output', 'plan']) {
    const nested = value[key]
    if (isRecord(nested)) return nested
  }

  return value
}

function normalizeWarnings(value: unknown): unknown {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (value === null || value === undefined || value === '') return undefined
  return value
}

function optionalString(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function optionalDate(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : trimmed || undefined
}

function optionalDateTime(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const candidate = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed
  const date = new Date(candidate)
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString()
}

function numberFromUnknown(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}

function booleanFromUnknown(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return value
}

function enumLowercase(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
