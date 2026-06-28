import { z } from 'zod'

import { RecurrenceRuleSchema } from './recurrence.schema'

export const EventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().optional(),
    displayDetails: z.string().trim().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    allDay: z.boolean().default(false),
    color: z.string().trim().optional(),
    eventTypeId: z.string().trim().min(1).default('general'),
    linkedTodoId: z.string().min(1).optional(),
    recurrenceRule: RecurrenceRuleSchema.optional(),
    masterId: z.string().min(1).optional(),
    exceptionFor: z.string().min(1).optional(),
    exceptionDate: z.string().date().optional(),
    deletedOccurrences: z.array(z.string()).optional(),
    syncStatus: z.enum(['synced', 'pending', 'conflict']).default('pending'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((event, ctx) => {
    if (new Date(event.endAt).getTime() <= new Date(event.startAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Event end time must be after start time',
        path: ['endAt'],
      })
    }
  })

export type Event = z.infer<typeof EventSchema>
