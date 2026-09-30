import { z } from 'zod'

import type { AICalendarActionPlan } from '../types'

const OperationSchema = z.object({
  status: z.enum(['pending', 'applied']),
  batchId: z.string().optional(),
  appliedAt: z.string().optional(),
})

export const AIPlanReferenceSchema = z.object({
  threadId: z.string().min(1).max(64),
  messageId: z.string().min(1).max(64),
})

export const AIPlanReviewSchema = z.object({
  version: z.literal(1),
  dismissed: z.boolean(),
  operations: z.object({ apply: OperationSchema, copy_to_todos: OperationSchema }),
})

export type AIPlanReference = z.infer<typeof AIPlanReferenceSchema>
export type AIPlanReview = z.infer<typeof AIPlanReviewSchema>
export type AIPlanOperation = 'apply' | 'copy_to_todos'
export type AIPlanRecord = {
  plan: AICalendarActionPlan
  ref: AIPlanReference
  review: AIPlanReview | null
}
