import { z } from 'zod'

export const TodoSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().trim().optional(),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  eventTypeId: z.string().trim().min(1).default('general'),
  dueDate: z.string().date().optional(),
  linkedEventId: z.string().min(1).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
})

export type Todo = z.infer<typeof TodoSchema>

