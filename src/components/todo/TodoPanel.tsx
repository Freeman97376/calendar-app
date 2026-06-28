import { useEffect, useState, type FormEvent } from 'react'

import type { RuntimeConfig, Todo } from '../../domain/types'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig'
import { useTaskStepAIRefinement } from '../../hooks/useTaskStepAIRefinement'
import { useTodoPanel } from '../../hooks/useTodoPanel'
import { useTodos } from '../../hooks/useTodos'
import EventTypeSettings from '../eventTypes/EventTypeSettings'
import Button from '../ui/Button'

type TodoFormState = {
  dueDate: string
  eventTypeId: string
  notes: string
  priority: Todo['priority']
  title: string
}

type ParsedTodoDetails = {
  fullJson: string
  intro: string[]
  itemLabel: 'Action' | 'Step'
  items: ParsedTodoDetailItem[]
  warnings: string[]
}

type ParsedTodoDetailItem = {
  completed: boolean
  hasCompletionMarker: boolean
  value: string
}

type DetailItemEditState = {
  itemIndex: number
  itemLabel: 'Action' | 'Step'
  todo: Todo
  value: string
}

function createEmptyTodoForm(config: RuntimeConfig): TodoFormState {
  return {
    dueDate: '',
    eventTypeId: config.defaultTodoEventTypeId,
    notes: '',
    priority: config.defaultTodoPriority,
    title: '',
  }
}

function formatDueDate(todo: Todo): string {
  if (!todo.dueDate) return 'No due date'

  return `Due ${todo.dueDate}`
}

function statusLabel(status: Todo['status']): string {
  if (status === 'doing') return 'In progress'
  if (status === 'done') return 'Done'
  return 'To do'
}

function isJsonHeader(line: string): boolean {
  return (
    line === 'Full JSON:' ||
    line === 'Action JSON:' ||
    line === 'Step JSON:' ||
    line === 'Full plan JSON:' ||
    line === 'Full goal JSON:'
  )
}

function parseDetailItemValue(value: string): ParsedTodoDetailItem {
  const trimmed = value.trim()
  const marker = /^\[(x|\s)\]\s*(.*)$/i.exec(trimmed)

  if (!marker) {
    return {
      completed: false,
      hasCompletionMarker: false,
      value: trimmed,
    }
  }

  return {
    completed: marker[1].toLowerCase() === 'x',
    hasCompletionMarker: true,
    value: marker[2].trim(),
  }
}

function formatDetailItemValue(
  value: string,
  completed: boolean,
  includeCompletionMarker: boolean,
): string {
  const trimmed = value.trim()
  if (!includeCompletionMarker) return trimmed

  return `[${completed ? 'x' : ' '}] ${trimmed}`
}

function parseTodoDetails(notes: string): ParsedTodoDetails {
  const details: ParsedTodoDetails = {
    fullJson: '',
    intro: [],
    itemLabel: 'Step',
    items: [],
    warnings: [],
  }
  let section: 'intro' | 'items' | 'warnings' | 'json' = 'intro'
  const jsonLines: string[] = []

  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const directItemMatch = /^(Action|Step)\s+\d+:\s*(.+)$/i.exec(line)

    if (line === 'Steps:' || line === 'Actions:') {
      details.itemLabel = line === 'Actions:' ? 'Action' : 'Step'
      section = 'items'
      continue
    }

    if (directItemMatch) {
      details.itemLabel = directItemMatch[1].toLowerCase() === 'action' ? 'Action' : 'Step'
      details.items.push(parseDetailItemValue(directItemMatch[2]))
      continue
    }

    if (line === 'Warnings:') {
      section = 'warnings'
      continue
    }

    if (isJsonHeader(line)) {
      section = 'json'
      jsonLines.push(rawLine)
      continue
    }

    if (section === 'json') {
      jsonLines.push(rawLine)
    } else if (section === 'items') {
      details.items.push(parseDetailItemValue(line.replace(/^\d+\.\s*/, '')))
    } else if (section === 'warnings') {
      details.warnings.push(line.replace(/^-\s*/, ''))
    } else {
      details.intro.push(line)
    }
  }

  details.fullJson = jsonLines.join('\n').trim()
  return details
}

function replaceTodoDetailItem(notes: string, itemIndex: number, nextValue: string): string {
  let section: 'intro' | 'items' | 'warnings' | 'json' = 'intro'
  let currentItemIndex = 0
  const nextLine = nextValue.trim()

  return notes
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim()
      const directItemMatch = /^(Action|Step)\s+\d+:\s*(.+)$/i.exec(line)

      if (line === 'Steps:' || line === 'Actions:') {
        section = 'items'
        return rawLine
      }

      if (line === 'Warnings:') {
        section = 'warnings'
        return rawLine
      }

      if (isJsonHeader(line)) {
        section = 'json'
        return rawLine
      }

      if (directItemMatch) {
        const index = currentItemIndex
        currentItemIndex += 1
        if (index !== itemIndex) return rawLine

        const indentation = rawLine.match(/^\s*/)?.[0] ?? ''
        const itemLabel = directItemMatch[1].toLowerCase() === 'action' ? 'Action' : 'Step'
        const currentItem = parseDetailItemValue(directItemMatch[2])
        const nextItem = formatDetailItemValue(
          nextLine,
          currentItem.completed,
          currentItem.hasCompletionMarker,
        )
        return `${indentation}${itemLabel} ${itemIndex + 1}: ${nextItem}`
      }

      if (section !== 'items' || !line) return rawLine

      const index = currentItemIndex
      currentItemIndex += 1
      if (index !== itemIndex) return rawLine

      const indentation = rawLine.match(/^\s*/)?.[0] ?? ''
      const currentItem = parseDetailItemValue(line.replace(/^\d+\.\s*/, ''))
      const nextItem = formatDetailItemValue(
        nextLine,
        currentItem.completed,
        currentItem.hasCompletionMarker,
      )
      return `${indentation}${itemIndex + 1}. ${nextItem}`
    })
    .join('\n')
}

function setTodoDetailItemCompletion(
  notes: string,
  itemIndex: number,
  completed: boolean,
): string {
  let section: 'intro' | 'items' | 'warnings' | 'json' = 'intro'
  let currentItemIndex = 0

  return notes
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim()
      const directItemMatch = /^(Action|Step)\s+\d+:\s*(.+)$/i.exec(line)

      if (line === 'Steps:' || line === 'Actions:') {
        section = 'items'
        return rawLine
      }

      if (line === 'Warnings:') {
        section = 'warnings'
        return rawLine
      }

      if (isJsonHeader(line)) {
        section = 'json'
        return rawLine
      }

      if (directItemMatch) {
        const index = currentItemIndex
        currentItemIndex += 1
        if (index !== itemIndex) return rawLine

        const indentation = rawLine.match(/^\s*/)?.[0] ?? ''
        const itemLabel = directItemMatch[1].toLowerCase() === 'action' ? 'Action' : 'Step'
        const item = parseDetailItemValue(directItemMatch[2])
        return `${indentation}${itemLabel} ${itemIndex + 1}: ${formatDetailItemValue(
          item.value,
          completed,
          true,
        )}`
      }

      if (section !== 'items' || !line) return rawLine

      const index = currentItemIndex
      currentItemIndex += 1
      if (index !== itemIndex) return rawLine

      const indentation = rawLine.match(/^\s*/)?.[0] ?? ''
      const item = parseDetailItemValue(line.replace(/^\d+\.\s*/, ''))
      return `${indentation}${itemIndex + 1}. ${formatDetailItemValue(item.value, completed, true)}`
    })
    .join('\n')
}

function TodoDetails({
  onEditItem,
  onSetAllItemSelection,
  onSendSelectedToAI,
  onToggleItemCompletion,
  onToggleItemSelection,
  selectedItemIndexes,
  todo,
}: {
  onEditItem: (todo: Todo, itemIndex: number, itemLabel: 'Action' | 'Step', value: string) => void
  onSetAllItemSelection: (todo: Todo, itemCount: number, selected: boolean) => void
  onSendSelectedToAI: (todo: Todo) => void
  onToggleItemCompletion: (
    todo: Todo,
    itemIndex: number,
    itemLabel: 'Action' | 'Step',
    completed: boolean,
  ) => void
  onToggleItemSelection: (todo: Todo, itemIndex: number, selected: boolean) => void
  selectedItemIndexes: number[]
  todo: Todo
}) {
  if (!todo.notes) return null

  const details = parseTodoDetails(todo.notes)
  const hasStructuredDetails = details.intro.length || details.items.length || details.warnings.length
  const allItemsSelected = details.items.length > 0 && selectedItemIndexes.length >= details.items.length

  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer text-slate-500">Details</summary>
      <div className="mt-2 space-y-2">
        {details.intro.length ? (
          <div className="space-y-1 rounded bg-slate-50 p-2">
            {details.intro.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}

        {details.items.length ? (
          <>
            <div className="flex justify-end">
              <Button
                className="h-8 px-2 text-xs"
                onClick={() => onSetAllItemSelection(todo, details.items.length, !allItemsSelected)}
                variant="ghost"
              >
                {allItemsSelected ? 'Clear selection' : 'Select all'}
              </Button>
            </div>
            <ol className="space-y-2">
              {details.items.map((item, index) => (
                <li
                  className={[
                    'rounded-md border p-2',
                    item.completed
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white',
                  ].join(' ')}
                  key={`${item.value}-${index}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
                      <input
                        aria-label={`Select ${details.itemLabel.toLowerCase()} ${index + 1} for AI`}
                        checked={selectedItemIndexes.includes(index)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                        onChange={(event) => onToggleItemSelection(todo, index, event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        {details.itemLabel} {index + 1}
                      </span>
                    </label>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        aria-label={
                          item.completed
                            ? `Reopen ${details.itemLabel.toLowerCase()} ${index + 1}`
                            : `Mark ${details.itemLabel.toLowerCase()} ${index + 1} done`
                        }
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          onToggleItemCompletion(todo, index, details.itemLabel, !item.completed)
                        }
                        variant={item.completed ? 'secondary' : 'ghost'}
                      >
                        {item.completed ? 'Reopen' : 'Mark done'}
                      </Button>
                      <Button
                        aria-label={`Edit ${details.itemLabel.toLowerCase()} ${index + 1}`}
                        className="h-7 px-2 text-xs"
                        onClick={() => onEditItem(todo, index, details.itemLabel, item.value)}
                        variant="ghost"
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                  <p
                    className={[
                      'mt-1 whitespace-pre-wrap text-xs leading-5',
                      item.completed ? 'text-slate-500 line-through' : 'text-slate-700',
                    ].join(' ')}
                  >
                    {item.value}
                  </p>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        {details.items.length ? (
          <div className="flex justify-end">
            <Button
              className="h-8 px-2 text-xs"
              disabled={!selectedItemIndexes.length}
              onClick={() => onSendSelectedToAI(todo)}
              variant="secondary"
            >
              Send selected to AI
            </Button>
          </div>
        ) : null}

        {details.warnings.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
            <p className="font-semibold">Warnings</p>
            <ul className="mt-1 space-y-1">
              {details.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {details.fullJson ? (
          <details className="rounded bg-slate-50 p-2">
            <summary className="cursor-pointer text-slate-500">Full JSON</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-slate-600">
              {details.fullJson}
            </pre>
          </details>
        ) : null}

        {!hasStructuredDetails ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-xs leading-5 text-slate-600">
            {todo.notes}
          </pre>
        ) : null}
      </div>
    </details>
  )
}

export default function TodoPanel() {
  const runtimeConfig = useRuntimeConfig()
  const todoPanel = useTodoPanel()
  const todos = useTodos()
  const taskStepAIRefinement = useTaskStepAIRefinement()
  const [editDraft, setEditDraft] = useState<TodoFormState | null>(null)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [editingDetailItem, setEditingDetailItem] = useState<DetailItemEditState | null>(null)
  const [selectedDetailItemsByTodoId, setSelectedDetailItemsByTodoId] = useState<Record<string, number[]>>({})
  const [todoDraft, setTodoDraft] = useState(() => createEmptyTodoForm(runtimeConfig))
  const [status, setStatus] = useState<string | null>(null)
  const firstTodoTypeId =
    todos.todoEventTypes.find((eventType) => eventType.id === runtimeConfig.defaultTodoEventTypeId)
      ?.id ??
    todos.todoEventTypes[0]?.id ??
    runtimeConfig.defaultTodoEventTypeId

  useEffect(() => {
    setTodoDraft((current) => {
      if (current.title || current.notes || current.dueDate) return current
      return createEmptyTodoForm(runtimeConfig)
    })
  }, [runtimeConfig])

  useEffect(() => {
    if (!todos.todoEventTypes.length) return

    setTodoDraft((current) => {
      const selectedTypeExists = todos.todoEventTypes.some(
        (eventType) => eventType.id === current.eventTypeId,
      )

      return selectedTypeExists ? current : { ...current, eventTypeId: firstTodoTypeId }
    })
  }, [firstTodoTypeId, todos.todoEventTypes])

  async function createTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!todoDraft.title.trim()) return

    const todo = await todos.addTodo({
      dueDate: todoDraft.dueDate || undefined,
      eventTypeId: todoDraft.eventTypeId,
      notes: todoDraft.notes || undefined,
      priority: todoDraft.priority,
      title: todoDraft.title.trim(),
    })

    setTodoDraft(createEmptyTodoForm(runtimeConfig))
    setStatus(`Added ${todo.title}`)
  }

  async function scheduleTodo(todo: Todo) {
    await todos.scheduleTodo(todo)
    setStatus(`Scheduled ${todo.title}`)
  }

  async function completeTodo(todo: Todo) {
    await todos.completeTodo(todo.id)
    setStatus(`Completed ${todo.title}`)
  }

  async function reopenTodo(todo: Todo) {
    await todos.reopenTodo(todo.id)
    setStatus(`Reopened ${todo.title}`)
  }

  async function deleteTodo(todo: Todo) {
    await todos.deleteTodo(todo.id)
    setStatus(`Deleted ${todo.title}`)
  }

  function openEditTodo(todo: Todo) {
    setEditingTodo(todo)
    setEditDraft({
      dueDate: todo.dueDate ?? '',
      eventTypeId: todo.eventTypeId,
      notes: todo.notes ?? '',
      priority: todo.priority,
      title: todo.title,
    })
  }

  function closeEditTodo() {
    setEditingTodo(null)
    setEditDraft(null)
  }

  function openEditDetailItem(
    todo: Todo,
    itemIndex: number,
    itemLabel: 'Action' | 'Step',
    value: string,
  ) {
    setEditingDetailItem({ itemIndex, itemLabel, todo, value })
  }

  function closeEditDetailItem() {
    setEditingDetailItem(null)
  }

  function toggleDetailItemSelection(todo: Todo, itemIndex: number, selected: boolean) {
    setSelectedDetailItemsByTodoId((current) => {
      const currentSelection = current[todo.id] ?? []
      const nextSelection = selected
        ? [...new Set([...currentSelection, itemIndex])].sort((left, right) => left - right)
        : currentSelection.filter((index) => index !== itemIndex)

      return {
        ...current,
        [todo.id]: nextSelection,
      }
    })
  }

  function setAllDetailItemSelection(todo: Todo, itemCount: number, selected: boolean) {
    setSelectedDetailItemsByTodoId((current) => ({
      ...current,
      [todo.id]: selected ? Array.from({ length: itemCount }, (_value, index) => index) : [],
    }))
  }

  function sendSelectedDetailItemsToAI(todo: Todo) {
    if (!todo.notes) return

    const selectedIndexes = selectedDetailItemsByTodoId[todo.id] ?? []
    const details = parseTodoDetails(todo.notes)
    const selectedItems = selectedIndexes
      .map((itemIndex) => {
        const item = details.items[itemIndex]
        if (!item) return null

        return {
          completed: item.completed,
          itemIndex,
          itemLabel: details.itemLabel,
          value: item.value,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    if (!selectedItems.length) return

    taskStepAIRefinement.sendToAI({
      kind: 'todo-step-refinement',
      selectedItems,
      todoId: todo.id,
      todoTitle: todo.title,
    })
    setSelectedDetailItemsByTodoId((current) => ({ ...current, [todo.id]: [] }))
    setStatus(`Sent ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} to AI Assistant.`)
  }

  async function saveEditedTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTodo || !editDraft?.title.trim()) return

    const updated = await todos.editTodo(editingTodo.id, {
      dueDate: editDraft.dueDate || undefined,
      eventTypeId: editDraft.eventTypeId,
      notes: editDraft.notes || undefined,
      priority: editDraft.priority,
      title: editDraft.title.trim(),
    })

    setStatus(`Updated ${updated.title}`)
    closeEditTodo()
  }

  async function saveEditedDetailItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingDetailItem?.todo.notes || !editingDetailItem.value.trim()) return

    const updatedNotes = replaceTodoDetailItem(
      editingDetailItem.todo.notes,
      editingDetailItem.itemIndex,
      editingDetailItem.value,
    )
    await todos.editTodo(editingDetailItem.todo.id, { notes: updatedNotes })
    setStatus(`Updated ${editingDetailItem.itemLabel.toLowerCase()} ${editingDetailItem.itemIndex + 1}.`)
    closeEditDetailItem()
  }

  async function toggleDetailItemCompletion(
    todo: Todo,
    itemIndex: number,
    itemLabel: 'Action' | 'Step',
    completed: boolean,
  ) {
    if (!todo.notes) return

    const updatedNotes = setTodoDetailItemCompletion(todo.notes, itemIndex, completed)
    await todos.editTodo(todo.id, { notes: updatedNotes })
    setStatus(
      `${completed ? 'Marked' : 'Reopened'} ${itemLabel.toLowerCase()} ${itemIndex + 1}${
        completed ? ' done' : ''
      }.`,
    )
  }

  return (
    <>
      <aside
        aria-label="Todo list"
        className="flex w-full flex-col border-t border-slate-200 bg-white xl:max-w-md xl:border-l xl:border-t-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <h2 className="text-base font-semibold text-slate-950">To-Do List</h2>
          <Button onClick={todoPanel.close} variant="ghost">
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <form className="space-y-3" onSubmit={createTodo}>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="todo-title">
              Task
            </label>
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="todo-title"
              onChange={(inputEvent) =>
                setTodoDraft((current) => ({ ...current, title: inputEvent.target.value }))
              }
              type="text"
              value={todoDraft.title}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-type">
                Type
              </label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-type"
                onChange={(inputEvent) =>
                  setTodoDraft((current) => ({ ...current, eventTypeId: inputEvent.target.value }))
                }
                value={todoDraft.eventTypeId}
              >
                {todos.todoEventTypes.length ? (
                  todos.todoEventTypes.map((eventType) => (
                    <option key={eventType.id} value={eventType.id}>
                      {eventType.label}
                    </option>
                  ))
                ) : (
                  <option value="general">General</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-priority">
                Priority
              </label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-priority"
                onChange={(inputEvent) =>
                  setTodoDraft((current) => ({
                    ...current,
                    priority: inputEvent.target.value as Todo['priority'],
                  }))
                }
                value={todoDraft.priority}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="todo-due-date">
              Due date
            </label>
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="todo-due-date"
              onChange={(inputEvent) =>
                setTodoDraft((current) => ({ ...current, dueDate: inputEvent.target.value }))
              }
              type="date"
              value={todoDraft.dueDate}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="todo-notes">
              Notes
            </label>
            <textarea
              className="mt-1 min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="todo-notes"
              onChange={(inputEvent) =>
                setTodoDraft((current) => ({ ...current, notes: inputEvent.target.value }))
              }
              value={todoDraft.notes}
            />
          </div>

          <Button disabled={!todoDraft.title.trim()} type="submit" variant="primary">
            Add task
          </Button>
        </form>

        {todos.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{todos.error}</p>
        ) : null}
        {status ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
        ) : null}

        <section aria-label="Open todos" className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-950">Open Tasks</h3>
          {todos.isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
          {!todos.openTodos.length && !todos.isLoading ? (
            <p className="text-sm text-slate-500">No open tasks.</p>
          ) : null}
          <div className="space-y-2">
            {todos.openTodos.map((todo) => {
              const eventType = todos.eventTypesById.get(todo.eventTypeId)

              return (
                <div className="rounded-md border border-slate-200 bg-white p-3" key={todo.id}>
                  <div className="flex items-start gap-3">
                    <button
                      aria-label={`Mark task ${todo.title} done`}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs text-white hover:border-emerald-700 hover:bg-emerald-700"
                      onClick={() => void completeTodo(todo)}
                      type="button"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">{todo.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {eventType ? (
                          <span className="inline-flex items-center gap-1">
                            <span
                              aria-hidden="true"
                              className="inline-block h-3 w-3 shrink-0 rounded-full border border-slate-200"
                              style={{ backgroundColor: eventType.color }}
                            />
                            {eventType.label}
                          </span>
                        ) : null}
                        <span>{formatDueDate(todo)}</span>
                        <span>{todo.priority} priority</span>
                        <span>{statusLabel(todo.status)}</span>
                      </p>
                      <TodoDetails
                        onEditItem={openEditDetailItem}
                        onSetAllItemSelection={setAllDetailItemSelection}
                        onSendSelectedToAI={sendSelectedDetailItemsToAI}
                        onToggleItemCompletion={(candidate, itemIndex, itemLabel, completed) =>
                          void toggleDetailItemCompletion(candidate, itemIndex, itemLabel, completed)
                        }
                        onToggleItemSelection={toggleDetailItemSelection}
                        selectedItemIndexes={selectedDetailItemsByTodoId[todo.id] ?? []}
                        todo={todo}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {todo.status === 'todo' ? (
                      <Button
                        onClick={() => todos.editTodo(todo.id, { status: 'doing' })}
                        variant="secondary"
                      >
                        Start
                      </Button>
                    ) : null}
                    <Button
                      disabled={Boolean(todo.linkedEventId)}
                      onClick={() => scheduleTodo(todo)}
                      variant="secondary"
                    >
                      {todo.linkedEventId ? 'Scheduled' : 'Schedule'}
                    </Button>
                    <Button onClick={() => void deleteTodo(todo)} variant="ghost">
                      Delete
                    </Button>
                    <Button onClick={() => openEditTodo(todo)} variant="ghost">
                      Edit
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-label="Completed todos" className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-950">Completed</h3>
          {!todos.doneTodos.length ? (
            <p className="text-sm text-slate-500">No completed tasks.</p>
          ) : null}
          <div className="space-y-2">
            {todos.doneTodos.map((todo) => (
              <div className="rounded-md border border-slate-200 bg-white p-3" key={todo.id}>
                <div className="flex items-start gap-3">
                  <button
                    aria-label={`Reopen task ${todo.title}`}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 text-xs text-white"
                    onClick={() => void reopenTodo(todo)}
                    type="button"
                  >
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-500 line-through">{todo.title}</p>
                    <p className="text-xs text-slate-400">{formatDueDate(todo)}</p>
                    <TodoDetails
                      onEditItem={openEditDetailItem}
                      onSetAllItemSelection={setAllDetailItemSelection}
                      onSendSelectedToAI={sendSelectedDetailItemsToAI}
                      onToggleItemCompletion={(candidate, itemIndex, itemLabel, completed) =>
                        void toggleDetailItemCompletion(candidate, itemIndex, itemLabel, completed)
                      }
                      onToggleItemSelection={toggleDetailItemSelection}
                      selectedItemIndexes={selectedDetailItemsByTodoId[todo.id] ?? []}
                      todo={todo}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => void reopenTodo(todo)} variant="ghost">
                    Reopen
                  </Button>
                  <Button onClick={() => void deleteTodo(todo)} variant="ghost">
                    Delete
                  </Button>
                  <Button onClick={() => openEditTodo(todo)} variant="ghost">
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <EventTypeSettings />
      </div>
      </aside>

      {editingTodo && editDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <form
            aria-labelledby="todo-edit-dialog-title"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-md bg-white p-4 shadow-xl"
            onSubmit={(event) => void saveEditedTodo(event)}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950" id="todo-edit-dialog-title">
                Edit Task
              </h2>
              <Button onClick={closeEditTodo} variant="ghost">
                Close
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-title">
                Task
              </label>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-edit-title"
                onChange={(event) => setEditDraft((current) => current && { ...current, title: event.target.value })}
                value={editDraft.title}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-type">
                  Type
                </label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="todo-edit-type"
                  onChange={(event) =>
                    setEditDraft((current) => current && { ...current, eventTypeId: event.target.value })
                  }
                  value={editDraft.eventTypeId}
                >
                  {todos.todoEventTypes.length ? (
                    todos.todoEventTypes.map((eventType) => (
                      <option key={eventType.id} value={eventType.id}>
                        {eventType.label}
                      </option>
                    ))
                  ) : (
                    <option value={editDraft.eventTypeId}>{editDraft.eventTypeId}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-priority">
                  Priority
                </label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="todo-edit-priority"
                  onChange={(event) =>
                    setEditDraft((current) =>
                      current ? { ...current, priority: event.target.value as Todo['priority'] } : current,
                    )
                  }
                  value={editDraft.priority}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-due-date">
                Due date
              </label>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-edit-due-date"
                onChange={(event) => setEditDraft((current) => current && { ...current, dueDate: event.target.value })}
                type="date"
                value={editDraft.dueDate}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-notes">
                Notes
              </label>
              <textarea
                className="mt-1 min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-edit-notes"
                onChange={(event) => setEditDraft((current) => current && { ...current, notes: event.target.value })}
                value={editDraft.notes}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={closeEditTodo}>Cancel</Button>
              <Button disabled={!editDraft.title.trim()} type="submit" variant="primary">
                Save task
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {editingDetailItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <form
            aria-labelledby="todo-detail-item-edit-title"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-md bg-white p-4 shadow-xl"
            onSubmit={(event) => void saveEditedDetailItem(event)}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950" id="todo-detail-item-edit-title">
                Edit {editingDetailItem.itemLabel} {editingDetailItem.itemIndex + 1}
              </h2>
              <Button onClick={closeEditDetailItem} variant="ghost">
                Close
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-detail-item-edit-value">
                {editingDetailItem.itemLabel} details
              </label>
              <textarea
                className="mt-1 min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-detail-item-edit-value"
                onChange={(event) =>
                  setEditingDetailItem((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
                value={editingDetailItem.value}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={closeEditDetailItem}>Cancel</Button>
              <Button disabled={!editingDetailItem.value.trim()} type="submit" variant="primary">
                Save {editingDetailItem.itemLabel.toLowerCase()}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
