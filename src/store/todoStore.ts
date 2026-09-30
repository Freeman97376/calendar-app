import { create } from 'zustand'

import type { ITodoService, TodoDraft, TodoUpdate } from '../services/todos/ITodoService'
import type { Todo } from '../domain/types'

export type TodoStore = {
  error: string | null
  isLoading: boolean
  todos: Todo[]
  completeTodo: (id: string) => Promise<Todo>
  createTodo: (draft: TodoDraft) => Promise<Todo>
  deleteTodo: (id: string) => Promise<void>
  loadTodos: () => Promise<Todo[]>
  reopenTodo: (id: string) => Promise<Todo>
  reconcileBatch: (todos: Todo[], deletedIds?: string[]) => void
  reset: (todos?: Todo[]) => void
  updateTodo: (id: string, changes: TodoUpdate) => Promise<Todo>
}

let todoService: ITodoService | null = null

export function configureTodoService(service: ITodoService | null) {
  todoService = service
}

function requireTodoService(): ITodoService {
  if (!todoService) {
    throw new Error('Todo service is not configured')
  }

  return todoService
}

export const useTodoStore = create<TodoStore>((set, get) => ({
  error: null,
  isLoading: false,
  todos: [],
  completeTodo: (id) =>
    get().updateTodo(id, {
      completedAt: new Date().toISOString(),
      status: 'done',
    }),
  createTodo: async (draft) => {
    try {
      const created = await requireTodoService().createTodo(draft)
      set((state) => ({ error: null, todos: [...state.todos, created] }))
      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create todo'
      set({ error: message })
      throw error
    }
  },
  deleteTodo: async (id) => {
    try {
      await requireTodoService().deleteTodo(id)
      set((state) => ({
        error: null,
        todos: state.todos.filter((todo) => todo.id !== id),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete todo'
      set({ error: message })
      throw error
    }
  },
  loadTodos: async () => {
    set({ error: null, isLoading: true })
    try {
      const todos = await requireTodoService().getTodos()
      set({ isLoading: false, todos })
      return todos
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load todos'
      set({ error: message, isLoading: false })
      throw error
    }
  },
  reopenTodo: (id) =>
    get().updateTodo(id, {
      completedAt: undefined,
      status: 'todo',
    }),
  reconcileBatch: (upserted, deletedIds = []) =>
    set((state) => {
      const deleted = new Set(deletedIds)
      const byId = new Map(
        state.todos.filter((todo) => !deleted.has(todo.id)).map((todo) => [todo.id, todo]),
      )
      upserted.forEach((todo) => byId.set(todo.id, todo))
      return { error: null, isLoading: false, todos: Array.from(byId.values()) }
    }),
  reset: (todos = []) => set({ error: null, isLoading: false, todos }),
  updateTodo: async (id, changes) => {
    try {
      const updated = await requireTodoService().updateTodo(id, changes)
      set((state) => ({
        error: null,
        todos: state.todos.map((todo) => (todo.id === id ? updated : todo)),
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update todo'
      set({ error: message })
      throw error
    }
  },
}))
