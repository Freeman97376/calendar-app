import { z } from 'zod'
import { AIPlanReferenceSchema, AIPlanReviewSchema } from './aiPlanReview.schema'

import { EventSchema } from './event.schema'
import { TodoSchema } from './todo.schema'

const EventCreateSchema = z.object({
  allDay: z.boolean().default(false),
  color: z.string().trim().optional(),
  description: z.string().trim().optional(),
  displayDetails: z.string().trim().optional(),
  endAt: z.string().datetime(),
  eventTypeId: z.string().trim().min(1).optional(),
  linkedTodoId: z.string().trim().min(1).optional(),
  startAt: z.string().datetime(),
  title: z.string().trim().min(1).max(200),
})

const EventChangesSchema = EventCreateSchema.partial().refine(
  (changes) => Object.values(changes).some((value) => value !== undefined),
  'At least one event field must be updated',
)

const TodoCreateSchema = z.object({
  dueDate: z.string().date().optional(),
  energyNeeded: z.enum(['high', 'medium', 'low']).default('medium'),
  etaMinutes: z.number().int().min(5).max(480).default(30),
  eventTypeId: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  title: z.string().trim().min(1).max(200),
})

const TodoChangesSchema = TodoCreateSchema.partial().refine(
  (changes) => Object.values(changes).some((value) => value !== undefined),
  'At least one todo field must be updated',
)

const ClientActionIdSchema = z.string().trim().min(1).max(64)

export const CalendarBatchActionSchema = z.discriminatedUnion('type', [
  z.object({
    clientActionId: ClientActionIdSchema,
    event: EventCreateSchema,
    projectId: z.string().trim().min(1).max(64).optional(),
    actionId: z.string().trim().min(1).max(64).optional(),
    skipIfDuplicate: z.boolean().default(true),
    type: z.literal('create_event'),
  }),
  z.object({
    changes: EventChangesSchema,
    clientActionId: ClientActionIdSchema,
    eventId: z.string().trim().min(1).max(64),
    projectId: z.string().trim().min(1).max(64).optional(),
    actionId: z.string().trim().min(1).max(64).optional(),
    type: z.literal('update_event'),
  }),
  z.object({
    clientActionId: ClientActionIdSchema,
    eventId: z.string().trim().min(1).max(64),
    projectId: z.string().trim().min(1).max(64).optional(),
    actionId: z.string().trim().min(1).max(64).optional(),
    type: z.literal('delete_event'),
  }),
  z.object({
    clientActionId: ClientActionIdSchema,
    todo: TodoCreateSchema,
    type: z.literal('create_todo'),
  }),
  z.object({
    changes: TodoChangesSchema,
    clientActionId: ClientActionIdSchema,
    todoId: z.string().trim().min(1).max(64),
    type: z.literal('update_todo'),
  }),
  z.object({
    clientActionId: ClientActionIdSchema,
    todoId: z.string().trim().min(1).max(64),
    type: z.literal('delete_todo'),
  }),
  z.object({
    clientActionId: ClientActionIdSchema,
    event: EventCreateSchema,
    todoId: z.string().trim().min(1).max(64),
    type: z.literal('schedule_todo'),
  }),
])

export const CalendarActionBatchRequestSchema = z
  .object({
    aiPlanRef: AIPlanReferenceSchema.optional(),
    aiPlanOperation: z.enum(['apply', 'copy_to_todos']).optional(),
    actions: z.array(CalendarBatchActionSchema).min(1).max(200),
    idempotencyKey: z.string().trim().min(1).max(120),
    projectId: z.string().trim().min(1).max(64).optional(),
    source: z.enum(['ai-action-plan', 'active-tool-calendar-drafts', 'global-schedule-proposal']),
    toolRunId: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((batch, context) => {
    if (batch.source === 'ai-action-plan' && (!batch.aiPlanRef || !batch.aiPlanOperation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Save the AI plan before reviewing it.',
      })
    }
    const ids = batch.actions.map((action) => action.clientActionId)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Calendar batch clientActionId values must be unique',
        path: ['actions'],
      })
    }
    if (batch.source === 'active-tool-calendar-drafts' && (!batch.projectId || !batch.toolRunId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Active Tool calendar batches require projectId and toolRunId',
      })
    }
    if (batch.source === 'global-schedule-proposal') {
      batch.actions.forEach((action, index) => {
        if (
          ['create_event', 'update_event', 'delete_event'].includes(action.type) &&
          (!('projectId' in action) ||
            !action.projectId ||
            !('actionId' in action) ||
            !action.actionId)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Global schedule event actions require projectId and actionId',
            path: ['actions', index],
          })
        }
      })
    }
  })

export const CalendarActionBatchResponseSchema = z.object({
  aiPlanReview: AIPlanReviewSchema.optional(),
  batchId: z.string().min(1),
  deletedEventIds: z.array(z.string()),
  deletedTodoIds: z.array(z.string()),
  eventsUpserted: z.array(EventSchema),
  replayed: z.boolean(),
  results: z.array(
    z.object({
      clientActionId: z.string().min(1),
      entityId: z.string().min(1),
      entityType: z.enum(['event', 'todo']),
      status: z.enum(['applied', 'skipped_duplicate']),
    }),
  ),
  status: z.literal('committed'),
  success: z.literal(true),
  todosUpserted: z.array(TodoSchema),
})

export type CalendarBatchAction = z.infer<typeof CalendarBatchActionSchema>
export type CalendarActionBatchRequest = z.infer<typeof CalendarActionBatchRequestSchema>
export type CalendarActionBatchResponse = z.infer<typeof CalendarActionBatchResponseSchema>
