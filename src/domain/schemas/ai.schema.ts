// src/domain/schemas/ai.schema.ts
// Layer 1: Domain — imports only zod
// ⚠️ APPROVAL REQUIRED before editing this file

import { z } from 'zod'

// See feature spec: office/docs/feature-specs/ai-assistant.md
// AI output is ALWAYS validated through this schema before use in the app.

export const AIStepSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  suggestedDayOffset: z.number().int().min(0).max(30),
  suggestedHour: z.number().int().min(0).max(23).optional(),
  priority: z.enum(['high', 'medium', 'low']),
})

export const AIBreakdownResultSchema = z.object({
  goal: z.string().trim().min(1).max(500),
  steps: z.array(AIStepSchema).min(1).max(20),
  totalEstimatedHours: z.number().min(0).optional(),
  notes: z.string().trim().optional(),
})

const ISODateTimeSchema = z.string().datetime()
const ISODateSchema = z.string().date()

const NonEmptyUpdateSchema = z
  .object({
    allDay: z.boolean().optional(),
    description: z.string().trim().optional(),
    displayDetails: z.string().trim().optional(),
    endAt: ISODateTimeSchema.optional(),
    eventTypeId: z.string().trim().min(1).optional(),
    startAt: ISODateTimeSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'At least one event field must be updated',
  })

const NonEmptyTodoUpdateSchema = z
  .object({
    dueDate: ISODateSchema.optional(),
    eventTypeId: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    status: z.enum(['todo', 'doing', 'done']).optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'At least one todo field must be updated',
  })

export const AICreateEventActionSchema = z.object({
  type: z.literal('create_event'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().optional(),
  displayDetails: z.string().trim().optional(),
  startAt: ISODateTimeSchema,
  endAt: ISODateTimeSchema,
  allDay: z.boolean().default(false),
  eventTypeId: z.string().trim().min(1).optional(),
  reason: z.string().trim().optional(),
})

export const AIUpdateEventActionSchema = z.object({
  type: z.literal('update_event'),
  eventId: z.string().trim().min(1),
  changes: NonEmptyUpdateSchema,
  reason: z.string().trim().optional(),
})

export const AIDeleteEventActionSchema = z.object({
  type: z.literal('delete_event'),
  eventId: z.string().trim().min(1),
  reason: z.string().trim().optional(),
})

export const AICreateTodoActionSchema = z.object({
  type: z.literal('create_todo'),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().optional(),
  dueDate: ISODateSchema.optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  eventTypeId: z.string().trim().min(1).optional(),
  reason: z.string().trim().optional(),
})

export const AIUpdateTodoActionSchema = z.object({
  type: z.literal('update_todo'),
  todoId: z.string().trim().min(1),
  changes: NonEmptyTodoUpdateSchema,
  reason: z.string().trim().optional(),
})

export const AIDeleteTodoActionSchema = z.object({
  type: z.literal('delete_todo'),
  todoId: z.string().trim().min(1),
  reason: z.string().trim().optional(),
})

export const AIScheduleTodoActionSchema = z.object({
  type: z.literal('schedule_todo'),
  todoId: z.string().trim().min(1),
  date: ISODateSchema.optional(),
  reason: z.string().trim().optional(),
})

export const AIActionSchema = z.discriminatedUnion('type', [
  AICreateEventActionSchema,
  AIUpdateEventActionSchema,
  AIDeleteEventActionSchema,
  AICreateTodoActionSchema,
  AIUpdateTodoActionSchema,
  AIDeleteTodoActionSchema,
  AIScheduleTodoActionSchema,
])

function createEventTimesAreValid(action: z.infer<typeof AICreateEventActionSchema>): boolean {
  return new Date(action.endAt).getTime() > new Date(action.startAt).getTime()
}

function updateEventTimesAreValid(action: z.infer<typeof AIUpdateEventActionSchema>): boolean {
  if (!action.changes.startAt || !action.changes.endAt) return true
  return new Date(action.changes.endAt).getTime() > new Date(action.changes.startAt).getTime()
}

export const AICalendarActionPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    actions: z.array(AIActionSchema).min(1).max(20),
    warnings: z.array(z.string().trim()).default([]),
  })
  .superRefine((plan, ctx) => {
    plan.actions.forEach((action, index) => {
      const validTimes =
        action.type === 'create_event'
          ? createEventTimesAreValid(action)
          : action.type === 'update_event'
            ? updateEventTimesAreValid(action)
            : true

      if (!validTimes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Event end time must be after start time',
          path: ['actions', index],
        })
      }
    })
  })

export const AIConversationResultSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  actionPlan: AICalendarActionPlanSchema.optional(),
})

export const AICalendarContextSchema = z.object({
  today: ISODateSchema,
  currentDate: ISODateSchema.optional(),
  currentDateTime: ISODateTimeSchema.optional(),
  currentLocalDateTime: z.string().trim().optional(),
  focusedDate: ISODateSchema.optional(),
  locale: z.string().trim().optional(),
  localDateTimeLabel: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  timezoneName: z.string().trim().optional(),
  timezoneOffsetLabel: z.string().trim().optional(),
  timezoneOffsetMinutes: z.number().int().optional(),
  events: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      displayDetails: z.string().optional(),
      startAt: ISODateTimeSchema,
      endAt: ISODateTimeSchema,
      allDay: z.boolean(),
      eventTypeId: z.string().min(1).optional(),
    }),
  ),
  todos: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      notes: z.string().optional(),
      status: z.enum(['todo', 'doing', 'done']),
      eventTypeId: z.string().min(1).optional(),
      dueDate: ISODateSchema.optional(),
      priority: z.enum(['high', 'medium', 'low']),
      linkedEventId: z.string().optional(),
    }),
  ),
  eventTypes: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      appliesTo: z.enum(['calendar', 'todo', 'both']),
      isArchived: z.boolean(),
    }),
  ),
})

export type AIStep = z.infer<typeof AIStepSchema>
export type AIBreakdownResult = z.infer<typeof AIBreakdownResultSchema>
export type AIAction = z.infer<typeof AIActionSchema>
export type AICalendarActionPlan = z.infer<typeof AICalendarActionPlanSchema>
export type AICalendarContext = z.infer<typeof AICalendarContextSchema>
export type AIConversationResult = z.infer<typeof AIConversationResultSchema>
