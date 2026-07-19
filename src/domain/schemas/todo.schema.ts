import { z } from 'zod'

export const TodoLongProjectSchema = z.object({
  memoryGoalId: z.string().trim().min(1),
  memoryProjectId: z.string().trim().min(1),
  sourceToolId: z.string().trim().min(1).optional(),
})

export const TodoSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().trim().optional(),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  eventTypeId: z.string().trim().min(1).default('general'),
  dueDate: z.string().date().optional(),
  linkedEventId: z.string().min(1).optional(),
  longProject: TodoLongProjectSchema.optional(),
  etaMinutes: z.coerce.number().int().min(5).max(480).default(30),
  energyNeeded: z.enum(['high', 'medium', 'low']).default('medium'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
})

export type Todo = z.infer<typeof TodoSchema>
export type TodoLongProject = z.infer<typeof TodoLongProjectSchema>
