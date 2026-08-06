import { z } from 'zod'

export const WeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])

export const RecurrenceRuleSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'custom']),
    interval: z.number().int().min(1).default(1),
    daysOfWeek: z.array(WeekdaySchema).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    endCondition: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('never') }),
        z.object({ type: z.literal('date'), until: z.string().datetime() }),
        z.object({ type: z.literal('count'), occurrences: z.number().int().min(1) }),
      ])
      .default({ type: 'never' }),
  })
  .superRefine((rule, ctx) => {
    if (
      (rule.frequency === 'weekly' || rule.frequency === 'custom') &&
      rule.daysOfWeek?.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one weekday is required',
        path: ['daysOfWeek'],
      })
    }
  })

export type Weekday = z.infer<typeof WeekdaySchema>
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>
