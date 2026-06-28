import { TodoSchema } from '../../domain/schemas/todo.schema'
import type { Todo } from '../../domain/types'
import type { ITodoService, TodoDraft, TodoUpdate } from './ITodoService'

function createTodoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `todo-${Date.now()}-${Math.random()}`
}

export class LocalTodoService implements ITodoService {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly key = 'calendar_todos',
  ) {}

  async createTodo(draft: TodoDraft): Promise<Todo> {
    const todos = this.readAll()
    const timestamp = new Date().toISOString()
    const todo = TodoSchema.parse({
      id: createTodoId(),
      title: draft.title,
      notes: draft.notes,
      eventTypeId: draft.eventTypeId ?? 'general',
      dueDate: draft.dueDate,
      priority: draft.priority ?? 'medium',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    this.writeAll([...todos, todo])
    return todo
  }

  async deleteTodo(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((todo) => todo.id !== id))
  }

  async getTodos(): Promise<Todo[]> {
    return this.readAll()
  }

  async updateTodo(id: string, changes: TodoUpdate): Promise<Todo> {
    const todos = this.readAll()
    const index = todos.findIndex((todo) => todo.id === id)

    if (index < 0) {
      throw new Error(`Todo not found: ${id}`)
    }

    const current = todos[index]
    const nextStatus = changes.status ?? current.status
    const updated = TodoSchema.parse({
      ...current,
      ...changes,
      completedAt: nextStatus === 'done' ? (changes.completedAt ?? current.completedAt ?? new Date().toISOString()) : undefined,
      updatedAt: new Date().toISOString(),
    })
    const nextTodos = [...todos]
    nextTodos[index] = updated
    this.writeAll(nextTodos)
    return updated
  }

  private readAll(): Todo[] {
    const raw = this.storage.getItem(this.key)

    if (!raw) return []

    try {
      return TodoSchema.array().parse(JSON.parse(raw))
    } catch {
      return []
    }
  }

  private writeAll(todos: Todo[]) {
    this.storage.setItem(this.key, JSON.stringify(TodoSchema.array().parse(todos)))
  }
}

