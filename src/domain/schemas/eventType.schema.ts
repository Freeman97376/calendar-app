import { z } from 'zod'

export const EventTypeSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(40),
  color: z.string().trim().min(1).max(32),
  appliesTo: z.enum(['calendar', 'todo', 'both']).default('both'),
  isArchived: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type EventType = z.infer<typeof EventTypeSchema>
