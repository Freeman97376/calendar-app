import { useEffect, useMemo, useState } from 'react'

import type { EventDraft } from '../domain/logic/eventUtils'
import type { Todo } from '../domain/types'
import { useEventStore } from '../store/eventStore'
import { useTodoStore } from '../store/todoStore'
import { useEventTypes } from './useEventTypes'
import { useRuntimeConfig } from './useRuntimeConfig'

function todayISODate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function priorityColor(priority: Todo['priority']): string {
  if (priority === 'high') return '#b91c1c'
  if (priority === 'medium') return '#047857'
  return '#2563eb'
}

function toScheduledEventDraft(todo: Todo, defaultStartTime: string): EventDraft {
  const dueDate = todo.dueDate ?? todayISODate()
  const startAt = new Date(`${dueDate}T${defaultStartTime}:00`).toISOString()
  const endAt = new Date(new Date(startAt).getTime() + todo.etaMinutes * 60_000).toISOString()

  return {
    title: todo.title,
    description: todo.notes,
    displayDetails: [
      todo.notes,
      `Task metadata: ${todo.etaMinutes} min, ${todo.priority} priority, ${todo.energyNeeded} energy`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    startAt,
    endAt,
    allDay: false,
    color: priorityColor(todo.priority),
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
  const runtimeConfig = useRuntimeConfig()
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
    const event = await createEvent(toScheduledEventDraft(todo, runtimeConfig.defaultEventStartTime))
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
