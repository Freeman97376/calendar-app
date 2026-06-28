import { useEffect, useMemo, useState } from 'react'

import type { EventDraft } from '../domain/logic/eventUtils'
import type { Todo } from '../domain/types'
import { useEventStore } from '../store/eventStore'
import { useTodoStore } from '../store/todoStore'
import { useEventTypes } from './useEventTypes'

function todayISODate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function toAllDayEventDraft(todo: Todo): EventDraft {
  const dueDate = todo.dueDate ?? todayISODate()

  return {
    title: todo.title,
    description: todo.notes,
    startAt: new Date(`${dueDate}T00:00:00`).toISOString(),
    endAt: new Date(`${dueDate}T23:59:00`).toISOString(),
    allDay: true,
    color: '#2563eb',
    eventTypeId: todo.eventTypeId,
    linkedTodoId: todo.id,
  }
}

export function useTodos() {
  const todos = useTodoStore((state) => state.todos)
  const error = useTodoStore((state) => state.error)
  const isLoading = useTodoStore((state) => state.isLoading)
  const completeTodo = useTodoStore((state) => state.completeTodo)
  const createTodo = useTodoStore((state) => state.createTodo)
  const deleteTodo = useTodoStore((state) => state.deleteTodo)
  const loadTodos = useTodoStore((state) => state.loadTodos)
  const reopenTodo = useTodoStore((state) => state.reopenTodo)
  const updateTodo = useTodoStore((state) => state.updateTodo)
  const createEvent = useEventStore((state) => state.createEvent)
  const eventTypes = useEventTypes()
  const [scheduledCount, setScheduledCount] = useState(0)

  useEffect(() => {
    loadTodos().catch(() => undefined)
  }, [loadTodos])

  const openTodos = useMemo(
    () => todos.filter((todo) => todo.status !== 'done'),
    [todos],
  )
  const doneTodos = useMemo(() => todos.filter((todo) => todo.status === 'done'), [todos])

  async function addTodo(draft: Parameters<typeof createTodo>[0]) {
    return createTodo({
      ...draft,
      eventTypeId: draft.eventTypeId || eventTypes.todoEventTypes[0]?.id || 'general',
    })
  }

  async function editTodo(id: string, changes: Parameters<typeof updateTodo>[1]) {
    return updateTodo(id, changes)
  }

  async function scheduleTodo(todo: Todo) {
    const event = await createEvent(toAllDayEventDraft(todo))
    await updateTodo(todo.id, { linkedEventId: event.id })
    setScheduledCount((count) => count + 1)
    return event
  }

  return {
    addTodo,
    archiveEventType: eventTypes.archiveEventType,
    completeTodo,
    createEventType: eventTypes.createEventType,
    deleteTodo,
    doneTodos,
    editTodo,
    error,
    eventTypes: eventTypes.eventTypes,
    eventTypesById: eventTypes.eventTypesById,
    isEventTypesLoading: eventTypes.isLoading,
    isLoading,
    openTodos,
    reopenTodo,
    scheduleTodo,
    scheduledCount,
    todoEventTypes: eventTypes.todoEventTypes,
    todos,
    updateEventType: eventTypes.updateEventType,
  }
}
