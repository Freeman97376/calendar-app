import { useEffect, useState, type FormEvent } from 'react'

import type { RuntimeConfig, Todo } from '../../domain/types'
import type {
  ActionItemStatus,
  LongTermActionItem,
  LongTermMilestone,
  MilestoneStatus,
} from '../../domain/types/longTermMemory'
import { useI18n } from '../../hooks/useI18n'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig'
import { useTaskStepAIRefinement } from '../../hooks/useTaskStepAIRefinement'
import { useTodoLongProjects } from '../../hooks/useTodoLongProjects'
import { useTodos } from '../../hooks/useTodos'
import EventTypeSettings from '../eventTypes/EventTypeSettings'
import Button from '../ui/Button'

type TodoFormState = {
  dueDate: string
  energyNeeded: Todo['energyNeeded']
  etaMinutes: string
  eventTypeId: string
  longProjectEnabled: boolean
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
    energyNeeded: 'medium',
    etaMinutes: '30',
    eventTypeId: config.defaultTodoEventTypeId,
    longProjectEnabled: false,
    notes: '',
    priority: config.defaultTodoPriority,
    title: '',
  }
}

function formatDueDate(todo: Todo, t: ReturnType<typeof useI18n>['t']): string {
  if (!todo.dueDate) return t('todo.noDueDate')

  return `${t('todo.dueDate')}: ${todo.dueDate}`
}

function statusLabel(status: Todo['status'], t: ReturnType<typeof useI18n>['t']): string {
  if (status === 'doing') return t('status.in_progress')
  if (status === 'done') return t('status.done')
  return t('status.todo')
}

function parseEtaMinutes(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 30
  return Math.min(480, Math.max(5, Math.round(parsed / 5) * 5))
}

function energyLabel(energyNeeded: Todo['energyNeeded'], t: ReturnType<typeof useI18n>['t']): string {
  if (energyNeeded === 'high') return t('todo.high')
  if (energyNeeded === 'low') return t('todo.low')
  return t('todo.medium')
}

const longProjectActionStatuses: ActionItemStatus[] = ['todo', 'scheduled', 'done', 'blocked', 'skipped']
const longProjectMilestoneStatuses: MilestoneStatus[] = [
  'not_started',
  'in_progress',
  'done',
  'blocked',
  'skipped',
]

function longProjectStatusLabel(status: string, t: ReturnType<typeof useI18n>['t']): string {
  const key = `status.${status}` as Parameters<ReturnType<typeof useI18n>['t']>[0]
  const translated = t(key)
  return translated === key ? status.replace(/_/g, ' ') : translated
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

function LongProjectDetails({
  actions,
  isActive,
  isLoading,
  milestones,
  onSetActionStatus,
  onSetMilestoneStatus,
  progressSummary,
}: {
  actions: LongTermActionItem[]
  isActive: boolean
  isLoading: boolean
  milestones: LongTermMilestone[]
  onSetActionStatus: (action: LongTermActionItem, status: ActionItemStatus) => void
  onSetMilestoneStatus: (milestone: LongTermMilestone, status: MilestoneStatus) => void
  progressSummary: { completed: number; percent: number; source: string; total: number }
}) {
  const { t } = useI18n()

  if (!isActive) {
    return <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">Open to load project progress.</p>
  }

  return (
    <section className="space-y-3 rounded-md border border-emerald-100 bg-emerald-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">{t('todo.longProject')}</p>
          <p className="mt-1 text-xs text-emerald-900">
            {t('enabled.completeFrom', {
              completed: progressSummary.completed,
              source: progressSummary.source,
              total: progressSummary.total,
            })}
          </p>
        </div>
        <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-emerald-800">
          {progressSummary.percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-emerald-700" style={{ width: `${progressSummary.percent}%` }} />
      </div>
      {isLoading ? <p className="text-xs text-emerald-800">{t('enabled.loadingMemory')}</p> : null}

      {milestones.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-950">{t('enabled.milestones')}</p>
          {milestones.map((milestone) => (
            <div className="rounded-md border border-emerald-100 bg-white p-2" key={milestone.milestone_id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">{milestone.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {milestone.due_date ? `${t('todo.dueDate')}: ${milestone.due_date}` : t('todo.noDueDate')}
                  </p>
                </div>
                <select
                  aria-label={`Long project milestone status for ${milestone.title}`}
                  className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs"
                  onChange={(event) => onSetMilestoneStatus(milestone, event.target.value as MilestoneStatus)}
                  value={milestone.status}
                >
                  {longProjectMilestoneStatuses.map((status) => (
                    <option key={status} value={status}>
                      {longProjectStatusLabel(status, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {actions.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-950">{t('enabled.actions')}</p>
          {actions.map((action) => (
            <div className="rounded-md border border-emerald-100 bg-white p-2" key={action.action_id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {action.due_date ? `${t('todo.dueDate')}: ${action.due_date}` : t('todo.noDueDate')}
                  </p>
                </div>
                <select
                  aria-label={`Long project action status for ${action.title}`}
                  className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs"
                  onChange={(event) => onSetActionStatus(action, event.target.value as ActionItemStatus)}
                  value={action.status}
                >
                  {longProjectActionStatuses.map((status) => (
                    <option key={status} value={status}>
                      {longProjectStatusLabel(status, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function TodoDetails({
  longProject,
  onEditItem,
  onOpenLongProject,
  onSetAllItemSelection,
  onSendSelectedToAI,
  onSetLongProjectActionStatus,
  onSetLongProjectMilestoneStatus,
  onToggleItemCompletion,
  onToggleItemSelection,
  selectedItemIndexes,
  todo,
}: {
  longProject: {
    actions: LongTermActionItem[]
    activeProjectId: string
    isLoading: boolean
    milestones: LongTermMilestone[]
    progressSummary: { completed: number; percent: number; source: string; total: number }
  }
  onEditItem: (todo: Todo, itemIndex: number, itemLabel: 'Action' | 'Step', value: string) => void
  onOpenLongProject: (todo: Todo) => void
  onSetAllItemSelection: (todo: Todo, itemCount: number, selected: boolean) => void
  onSendSelectedToAI: (todo: Todo) => void
  onSetLongProjectActionStatus: (action: LongTermActionItem, status: ActionItemStatus) => void
  onSetLongProjectMilestoneStatus: (milestone: LongTermMilestone, status: MilestoneStatus) => void
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
  if (!todo.notes && !todo.longProject) return null

  const details = parseTodoDetails(todo.notes ?? '')
  const hasStructuredDetails = details.intro.length || details.items.length || details.warnings.length
  const allItemsSelected = details.items.length > 0 && selectedItemIndexes.length >= details.items.length
  const longProjectActive =
    Boolean(todo.longProject) && longProject.activeProjectId === todo.longProject?.memoryProjectId

  return (
    <details
      className="mt-2 text-xs text-slate-600"
      onToggle={(event) => {
        if (event.currentTarget.open && todo.longProject) onOpenLongProject(todo)
      }}
    >
      <summary className="cursor-pointer text-slate-500">Details</summary>
      <div className="mt-2 space-y-2">
        {todo.longProject ? (
          <LongProjectDetails
            actions={longProjectActive ? longProject.actions : []}
            isActive={longProjectActive}
            isLoading={longProject.isLoading}
            milestones={longProjectActive ? longProject.milestones : []}
            onSetActionStatus={onSetLongProjectActionStatus}
            onSetMilestoneStatus={onSetLongProjectMilestoneStatus}
            progressSummary={
              longProjectActive
                ? longProject.progressSummary
                : { completed: 0, percent: 0, source: 'empty', total: 0 }
            }
          />
        ) : null}

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

        {todo.notes && !hasStructuredDetails ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-xs leading-5 text-slate-600">
            {todo.notes}
          </pre>
        ) : null}
      </div>
    </details>
  )
}

export default function TodoPanel() {
  const { t } = useI18n()
  const runtimeConfig = useRuntimeConfig()
  const todoLongProjects = useTodoLongProjects()
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
      energyNeeded: todoDraft.energyNeeded,
      etaMinutes: parseEtaMinutes(todoDraft.etaMinutes),
      eventTypeId: todoDraft.eventTypeId,
      longProject: todoDraft.longProjectEnabled
        ? await todoLongProjects.createLink(todoDraft.title.trim(), todoDraft.notes || undefined)
        : undefined,
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
      energyNeeded: todo.energyNeeded,
      etaMinutes: String(todo.etaMinutes),
      eventTypeId: todo.eventTypeId,
      longProjectEnabled: Boolean(todo.longProject),
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

  async function openLongProject(todo: Todo) {
    if (!todo.longProject) return

    await todoLongProjects.load(todo.longProject)
  }

  async function setLongProjectActionStatus(action: LongTermActionItem, nextStatus: ActionItemStatus) {
    await todoLongProjects.setActionStatus(action, nextStatus)
    setStatus(`Updated ${action.title} to ${longProjectStatusLabel(nextStatus, t)}.`)
  }

  async function setLongProjectMilestoneStatus(
    milestone: LongTermMilestone,
    nextStatus: MilestoneStatus,
  ) {
    await todoLongProjects.setMilestoneStatus(milestone, nextStatus)
    setStatus(`Updated ${milestone.title} to ${longProjectStatusLabel(nextStatus, t)}.`)
  }

  async function saveEditedTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTodo || !editDraft?.title.trim()) return

    const updated = await todos.editTodo(editingTodo.id, {
      dueDate: editDraft.dueDate || undefined,
      energyNeeded: editDraft.energyNeeded,
      etaMinutes: parseEtaMinutes(editDraft.etaMinutes),
      eventTypeId: editDraft.eventTypeId,
      longProject: editDraft.longProjectEnabled
        ? editingTodo.longProject ??
          (await todoLongProjects.createLink(editDraft.title.trim(), editDraft.notes || undefined))
        : undefined,
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
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <h2 className="text-base font-semibold text-slate-950">{t('todo.title')}</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <form className="space-y-3" onSubmit={createTodo}>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="todo-title">
              {t('todo.task')}
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
                {t('todo.type')}
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
                  <option value="general">{t('todo.general')}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-priority">
                {t('todo.priority')}
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
                <option value="high">{t('todo.high')}</option>
                <option value="medium">{t('todo.medium')}</option>
                <option value="low">{t('todo.low')}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-eta">
                {t('todo.etaMinutes')}
              </label>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-eta"
                max={480}
                min={5}
                onChange={(inputEvent) =>
                  setTodoDraft((current) => ({ ...current, etaMinutes: inputEvent.target.value }))
                }
                step={5}
                type="number"
                value={todoDraft.etaMinutes}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-energy">
                {t('todo.energyNeeded')}
              </label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-energy"
                onChange={(inputEvent) =>
                  setTodoDraft((current) => ({
                    ...current,
                    energyNeeded: inputEvent.target.value as Todo['energyNeeded'],
                  }))
                }
                value={todoDraft.energyNeeded}
              >
                <option value="high">{t('todo.high')}</option>
                <option value="medium">{t('todo.medium')}</option>
                <option value="low">{t('todo.low')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="todo-due-date">
              {t('todo.dueDate')}
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
              {t('todo.notes')}
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

          <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              checked={todoDraft.longProjectEnabled}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              onChange={(inputEvent) =>
                setTodoDraft((current) => ({
                  ...current,
                  longProjectEnabled: inputEvent.target.checked,
                }))
              }
              type="checkbox"
            />
            <span>
              {t('todo.longProject')}
              <span className="mt-1 block text-xs text-slate-500">
                {t('todo.longProjectDescription')}
              </span>
            </span>
          </label>

          <Button disabled={!todoDraft.title.trim()} type="submit" variant="primary">
            {t('todo.addTask')}
          </Button>
        </form>

        {todos.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{todos.error}</p>
        ) : null}
        {todoLongProjects.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {todoLongProjects.error}
          </p>
        ) : null}
        {status ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
        ) : null}

        <section aria-label={t('todo.openTasks')} className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-950">{t('todo.openTasks')}</h3>
          {todos.isLoading ? <p className="text-sm text-slate-500">{t('todo.loading')}</p> : null}
          {!todos.openTodos.length && !todos.isLoading ? (
            <p className="text-sm text-slate-500">{t('todo.noOpenTasks')}</p>
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
                        <span>{formatDueDate(todo, t)}</span>
                        <span>{t('todo.etaShort')}: {todo.etaMinutes}m</span>
                        <span>{t('todo.priority')}: {todo.priority}</span>
                        <span>{t('todo.energyNeeded')}: {energyLabel(todo.energyNeeded, t)}</span>
                        <span>{statusLabel(todo.status, t)}</span>
                      </p>
                      <TodoDetails
                        longProject={{
                          actions: todoLongProjects.actions,
                          activeProjectId: todoLongProjects.activeProjectId,
                          isLoading: todoLongProjects.isDetailLoading,
                          milestones: todoLongProjects.milestones,
                          progressSummary: todoLongProjects.progressSummary,
                        }}
                        onEditItem={openEditDetailItem}
                        onOpenLongProject={(candidate) => void openLongProject(candidate)}
                        onSetAllItemSelection={setAllDetailItemSelection}
                        onSendSelectedToAI={sendSelectedDetailItemsToAI}
                        onSetLongProjectActionStatus={(action, nextStatus) =>
                          void setLongProjectActionStatus(action, nextStatus)
                        }
                        onSetLongProjectMilestoneStatus={(milestone, nextStatus) =>
                          void setLongProjectMilestoneStatus(milestone, nextStatus)
                        }
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
                        {t('todo.start')}
                      </Button>
                    ) : null}
                    <Button
                      disabled={Boolean(todo.linkedEventId)}
                      onClick={() => scheduleTodo(todo)}
                      variant="secondary"
                    >
                      {todo.linkedEventId ? t('todo.scheduled') : t('todo.schedule')}
                    </Button>
                    <Button onClick={() => void deleteTodo(todo)} variant="ghost">
                      {t('todo.delete')}
                    </Button>
                    <Button onClick={() => openEditTodo(todo)} variant="ghost">
                      {t('todo.edit')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-label={t('todo.completed')} className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-950">{t('todo.completed')}</h3>
          {!todos.doneTodos.length ? (
            <p className="text-sm text-slate-500">{t('todo.noCompletedTasks')}</p>
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
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{formatDueDate(todo, t)}</span>
                      <span>{t('todo.etaShort')}: {todo.etaMinutes}m</span>
                      <span>{t('todo.priority')}: {todo.priority}</span>
                      <span>{t('todo.energyNeeded')}: {energyLabel(todo.energyNeeded, t)}</span>
                    </p>
                    <TodoDetails
                      longProject={{
                        actions: todoLongProjects.actions,
                        activeProjectId: todoLongProjects.activeProjectId,
                        isLoading: todoLongProjects.isDetailLoading,
                        milestones: todoLongProjects.milestones,
                        progressSummary: todoLongProjects.progressSummary,
                      }}
                      onEditItem={openEditDetailItem}
                      onOpenLongProject={(candidate) => void openLongProject(candidate)}
                      onSetAllItemSelection={setAllDetailItemSelection}
                      onSendSelectedToAI={sendSelectedDetailItemsToAI}
                      onSetLongProjectActionStatus={(action, nextStatus) =>
                        void setLongProjectActionStatus(action, nextStatus)
                      }
                      onSetLongProjectMilestoneStatus={(milestone, nextStatus) =>
                        void setLongProjectMilestoneStatus(milestone, nextStatus)
                      }
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
                    {t('todo.reopen')}
                  </Button>
                  <Button onClick={() => void deleteTodo(todo)} variant="ghost">
                    {t('todo.delete')}
                  </Button>
                  <Button onClick={() => openEditTodo(todo)} variant="ghost">
                    {t('todo.edit')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <EventTypeSettings />
      </div>
      </div>

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
                {t('todo.editTask')}
              </h2>
              <Button onClick={closeEditTodo} variant="ghost">
                {t('workspace.close')}
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-title">
                {t('todo.task')}
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
                  {t('todo.type')}
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
                  {t('todo.priority')}
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
                  <option value="high">{t('todo.high')}</option>
                  <option value="medium">{t('todo.medium')}</option>
                  <option value="low">{t('todo.low')}</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-eta">
                  {t('todo.etaMinutes')}
                </label>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="todo-edit-eta"
                  max={480}
                  min={5}
                  onChange={(event) =>
                    setEditDraft((current) => current && { ...current, etaMinutes: event.target.value })
                  }
                  step={5}
                  type="number"
                  value={editDraft.etaMinutes}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-energy">
                  {t('todo.energyNeeded')}
                </label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="todo-edit-energy"
                  onChange={(event) =>
                    setEditDraft((current) =>
                      current
                        ? { ...current, energyNeeded: event.target.value as Todo['energyNeeded'] }
                        : current,
                    )
                  }
                  value={editDraft.energyNeeded}
                >
                  <option value="high">{t('todo.high')}</option>
                  <option value="medium">{t('todo.medium')}</option>
                  <option value="low">{t('todo.low')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="todo-edit-due-date">
                {t('todo.dueDate')}
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
                {t('todo.notes')}
              </label>
              <textarea
                className="mt-1 min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="todo-edit-notes"
                onChange={(event) => setEditDraft((current) => current && { ...current, notes: event.target.value })}
                value={editDraft.notes}
              />
            </div>

            <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input
                checked={editDraft.longProjectEnabled}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, longProjectEnabled: event.target.checked } : current,
                  )
                }
                type="checkbox"
              />
              <span>
                {t('todo.longProject')}
                <span className="mt-1 block text-xs text-slate-500">
                  {t('todo.linkLongProject')}
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button onClick={closeEditTodo}>{t('event.cancel')}</Button>
              <Button disabled={!editDraft.title.trim()} type="submit" variant="primary">
                {t('todo.saveTask')}
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
                {t('workspace.close')}
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
              <Button onClick={closeEditDetailItem}>{t('event.cancel')}</Button>
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
