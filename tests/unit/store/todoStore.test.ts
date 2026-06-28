import { beforeEach, describe, expect, it } from 'vitest'

import { LocalTodoService } from '../../../src/services/todos/localTodoService'
import { configureTodoService, useTodoStore } from '../../../src/store/todoStore'

describe('todoStore', () => {
  beforeEach(() => {
    localStorage.clear()
    configureTodoService(new LocalTodoService(localStorage, 'test_todos'))
    useTodoStore.getState().reset()
  })

  it('creates todos in local state', async () => {
    const todo = await useTodoStore.getState().createTodo({
      dueDate: '2026-06-10',
      eventTypeId: 'project',
      title: 'Draft launch plan',
    })

    expect(useTodoStore.getState().todos).toContainEqual(todo)
    expect(todo).toMatchObject({
      dueDate: '2026-06-10',
      eventTypeId: 'project',
      status: 'todo',
    })
  })

  it('updates status and completion metadata', async () => {
    const todo = await useTodoStore.getState().createTodo({ title: 'Review proposal' })

    const completed = await useTodoStore.getState().completeTodo(todo.id)

    expect(completed.status).toBe('done')
    expect(completed.completedAt).toBeTruthy()

    const reopened = await useTodoStore.getState().reopenTodo(todo.id)

    expect(reopened.status).toBe('todo')
    expect(reopened.completedAt).toBeUndefined()
  })

  it('deletes todos from local state', async () => {
    const todo = await useTodoStore.getState().createTodo({ title: 'Remove me' })

    await useTodoStore.getState().deleteTodo(todo.id)

    expect(useTodoStore.getState().todos).toHaveLength(0)
  })

  it('persists long project links on todos', async () => {
    const todo = await useTodoStore.getState().createTodo({
      longProject: {
        memoryGoalId: 'goal_1',
        memoryProjectId: 'project_1',
        sourceToolId: 'todo-long-project',
      },
      title: 'Build a long project',
    })

    expect(todo.longProject).toEqual({
      memoryGoalId: 'goal_1',
      memoryProjectId: 'project_1',
      sourceToolId: 'todo-long-project',
    })
  })
})
