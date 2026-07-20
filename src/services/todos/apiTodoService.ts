import { TodoSchema } from '../../domain/schemas/todo.schema'
import type { Todo } from '../../domain/types'
import type { CalendarApiClient } from '../calendarApiClient'
import type { ITodoService, TodoDraft, TodoUpdate } from './ITodoService'

export class ApiTodoService implements ITodoService {
  constructor(private readonly client: CalendarApiClient) {}

  async createTodo(draft: TodoDraft): Promise<Todo> {
    const response = await this.client.post<{ success: true; todo: unknown }>(
      '/api/calendar/todos',
      draft,
    )
    return TodoSchema.parse(response.todo)
  }

  async deleteTodo(id: string): Promise<void> {
    await this.client.delete<{ success: true; deleted: true }>(`/api/calendar/todos/${id}`)
  }

  async getTodos(): Promise<Todo[]> {
    const response = await this.client.get<{ success: true; todos: unknown[] }>(
      '/api/calendar/todos',
    )
    return TodoSchema.array().parse(response.todos)
  }

  async updateTodo(id: string, changes: TodoUpdate): Promise<Todo> {
    const response = await this.client.patch<{ success: true; todo: unknown }>(
      `/api/calendar/todos/${id}`,
      changes,
    )
    return TodoSchema.parse(response.todo)
  }
}
