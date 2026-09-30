import { z } from 'zod'

export const SchedulingWindowSchema = z
  .object({
    day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((value) => value.end > value.start, { message: '结束时间必须晚于开始时间。' })

export const SchedulingPreferencesSchema = z
  .object({
    setupCompleted: z.boolean().default(false),
    workWindows: z.array(SchedulingWindowSchema).max(28).default([]),
    minBlockMinutes: z.number().int().min(5).max(240).default(30),
    maxBlockMinutes: z.number().int().min(15).max(480).default(120),
  })
  .superRefine((value, context) => {
    if (value.minBlockMinutes > value.maxBlockMinutes) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: '最小时间块不能大于最大时间块。' })
    }
    if (value.setupCompleted && !value.workWindows.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: '至少需要一个工作时段。' })
    }
    value.workWindows.forEach((window, index) => {
      value.workWindows.slice(0, index).forEach((previous) => {
        if (
          previous.day === window.day &&
          window.start < previous.end &&
          window.end > previous.start
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${window.day} 的工作时段不能重叠。`,
            path: ['workWindows', index],
          })
        }
      })
    })
  })

const ScheduleEventChangeSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  eventId: z.string(),
  projectId: z.string(),
  actionId: z.string(),
  event: z.record(z.unknown()).optional(),
  linkId: z.string().optional(),
})

export const ScheduleProposalBodySchema = z
  .object({
    kind: z.enum(['global_schedule', 'setup_required']),
    reason: z.string(),
    message: z.string(),
    changes: z.array(ScheduleEventChangeSchema).default([]),
    actionDateChanges: z.array(z.record(z.unknown())).default([]),
    conflicts: z.array(z.record(z.unknown())).default([]),
    toolImpacts: z.array(z.record(z.unknown())).default([]),
    capacityBorrowing: z.array(z.record(z.unknown())).default([]),
    unscheduled: z.array(z.record(z.unknown())).default([]),
    timezone: z.string().optional(),
    autoApply: z.literal(false),
    applyResult: z.record(z.unknown()).optional(),
  })
  .passthrough()

export const ScheduleProposalSchema = z.object({
  proposalId: z.string(),
  status: z.enum(['pending', 'blocked', 'accepted', 'rejected', 'superseded']),
  inputFingerprint: z.string().length(64),
  proposal: ScheduleProposalBodySchema,
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  replayed: z.boolean().default(false),
})

export const ScheduleProposalResponseSchema = z.object({
  success: z.literal(true),
  proposal: ScheduleProposalSchema.nullable(),
})

export type SchedulingWindow = z.infer<typeof SchedulingWindowSchema>
export type SchedulingPreferences = z.infer<typeof SchedulingPreferencesSchema>
export type ScheduleProposal = z.infer<typeof ScheduleProposalSchema>
