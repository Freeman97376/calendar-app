import type { Todo } from '../../domain/types'

export type TodoDraft = {
  title: string
  notes?: string
  eventTypeId?: string
  dueDate?: string
  etaMinutes?: Todo['etaMinutes']
  energyNeeded?: Todo['energyNeeded']
  longProject?: Todo['longProject']
  priority?: Todo['priority']
}

export type TodoUpdate = Partial<TodoDraft> & {
  completedAt?: string
  linkedEventId?: string
  status?: Todo['status']
}

export interface ITodoService {
  createTodo(draft: TodoDraft): Promise<Todo>
  deleteTodo(id: string): Promise<void>
  getTodos(): Promise<Todo[]>
  updateTodo(id: string, changes: TodoUpdate): Promise<Todo>
}
