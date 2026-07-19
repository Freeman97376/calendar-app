import { useEffect } from 'react'
import { addDays, set } from 'date-fns'

import { isDuplicateEventDraft } from '../domain/logic/eventDeduplication'
import type { EventDraft } from '../domain/logic/eventUtils'
import { getLocalTimeContext } from '../domain/logic/timeContext'
import { AICalendarContextSchema } from '../domain/schemas/ai.schema'
import type {
  AIAction,
  AIBreakdownResult,
  AICalendarActionPlan,
  AIProvider,
  AIStep,
  RuntimeConfig,
  Todo,
} from '../domain/types'
import type { AIConversationContext } from '../domain/types/aiConversation'
import { useAIStore } from '../store/aiStore'
import { useCalendarStore } from '../store/calendarStore'
import { useConfigStore } from '../store/configStore'
import { useEventStore } from '../store/eventStore'
import { useEventTypeStore } from '../store/eventTypeStore'
import { useTodoStore } from '../store/todoStore'
import { useUIStore } from '../store/uiStore'

export type { AIMessage } from '../store/aiStore'

export type AIComposerOptions = {
  allowActiveToolRouting?: boolean
  confirmActiveToolRouting?: boolean
  includeCalendarContext?: boolean
  includeTodoContext?: boolean
}

function scheduledStart(focusedDate: string, step: AIStep): Date {
  const [year, month, day] = focusedDate.split('-').map(Number)
  const date = addDays(new Date(year, month - 1, day), step.suggestedDayOffset)

  return set(date, {
    hours: step.suggestedHour ?? 9,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  })
}

function priorityColor(priority: AIStep['priority']): string {
  if (priority === 'high') return '#b91c1c'
  if (priority === 'medium') return '#047857'
  return '#2563eb'
}

function localDateFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function localDateFromDateTime(value: string): string | undefined {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  return localDateFromDate(date)
}

function compactTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length <= 180 ? trimmed : `${trimmed.slice(0, 177)}...`
}

function actionTitle(action: AIAction): string {
  if (action.type === 'create_event') return action.title
  if (action.type === 'update_event') return action.changes.title ?? `Update event ${action.eventId}`
  if (action.type === 'delete_event') return `Delete event ${action.eventId}`
  if (action.type === 'create_todo') return action.title
  if (action.type === 'update_todo') return action.changes.title ?? `Update task ${action.todoId}`
  if (action.type === 'delete_todo') return `Delete task ${action.todoId}`
  return `Schedule task ${action.todoId}`
}

function actionNotesLine(action: AIAction): string {
  const title = actionTitle(action)

  if (action.type === 'create_event') return `${action.type}: ${title} (${action.startAt} - ${action.endAt})`
  if (action.type === 'update_event') return `${action.type}: ${title} (${JSON.stringify(action.changes)})`
  if (action.type === 'create_todo') return `${action.type}: ${title}${action.dueDate ? ` (due ${action.dueDate})` : ''}`
  if (action.type === 'update_todo') return `${action.type}: ${title} (${JSON.stringify(action.changes)})`
  if (action.type === 'schedule_todo') {
    const when = action.startAt && action.endAt ? `${action.startAt} - ${action.endAt}` : action.date
    return `${action.type}: ${title}${when ? ` (${when})` : ''}`
  }

  return `${action.type}: ${title}`
}

function actionDueDateFor(action: AIAction): string | undefined {
  if (action.type === 'create_event') return localDateFromDateTime(action.startAt)
  if (action.type === 'update_event' && action.changes.startAt) {
    return localDateFromDateTime(action.changes.startAt)
  }
  if (action.type === 'create_todo') return action.dueDate
  if (action.type === 'update_todo') return action.changes.dueDate
  if (action.type === 'schedule_todo') return action.startAt ? localDateFromDateTime(action.startAt) : action.date
  return undefined
}

function actionPriority(action: AIAction): Todo['priority'] {
  if (action.type === 'create_todo') return action.priority
  if (action.type === 'update_todo' && action.changes.priority) return action.changes.priority
  return 'medium'
}

function actionEtaMinutes(action: AIAction): Todo['etaMinutes'] {
  if (action.type === 'create_todo') return action.etaMinutes
  if (action.type === 'update_todo' && action.changes.etaMinutes) return action.changes.etaMinutes
  if (action.type === 'create_event') {
    const duration = Math.round(
      (new Date(action.endAt).getTime() - new Date(action.startAt).getTime()) / 60_000,
    )
    return Number.isFinite(duration) ? Math.min(480, Math.max(5, duration)) : 30
  }
  return 30
}

function actionEnergyNeeded(action: AIAction): Todo['energyNeeded'] {
  if (action.type === 'create_todo') return action.energyNeeded
  if (action.type === 'update_todo' && action.changes.energyNeeded) return action.changes.energyNeeded
  return 'medium'
}

function actionEventTypeId(action: AIAction, config: RuntimeConfig): string {
  if ('eventTypeId' in action && action.eventTypeId) return action.eventTypeId
  if (action.type === 'update_event' && action.changes.eventTypeId) return action.changes.eventTypeId
  if (action.type === 'update_todo' && action.changes.eventTypeId) return action.changes.eventTypeId
  return config.defaultTodoEventTypeId
}

function actionToTodo(plan: AICalendarActionPlan, action: AIAction, index: number, config: RuntimeConfig) {
  return {
    dueDate: actionDueDateFor(action),
    eventTypeId: actionEventTypeId(action, config),
    notes: [
      'AI Assistant action',
      '',
      `Summary: ${plan.summary}`,
      `Action ${index + 1}: ${actionNotesLine(action)}`,
      action.reason ? `Reason: ${action.reason}` : '',
      ...(plan.warnings.length ? ['', 'Warnings:', ...plan.warnings.map((warning) => `- ${warning}`)] : []),
      '',
      'Action JSON:',
      JSON.stringify(action, null, 2),
      '',
      'Full plan JSON:',
      JSON.stringify(plan, null, 2),
    ]
      .filter(Boolean)
      .join('\n'),
    energyNeeded: actionEnergyNeeded(action),
    etaMinutes: actionEtaMinutes(action),
    priority: actionPriority(action),
    title: compactTitle(actionTitle(action)),
  }
}

function planToTodos(plan: AICalendarActionPlan, config: RuntimeConfig) {
  return plan.actions.map((action, index) => actionToTodo(plan, action, index, config))
}

function stepDueDate(focusedDate: string, step: AIStep): string {
  return localDateFromDate(scheduledStart(focusedDate, step))
}

function stepToTodo(
  suggestion: AIBreakdownResult,
  step: AIStep,
  index: number,
  focusedDate: string,
  config: RuntimeConfig,
) {
  return {
    dueDate: stepDueDate(focusedDate, step),
    eventTypeId: config.defaultTodoEventTypeId,
    notes: [
      'AI Assistant goal step',
      '',
      `Goal: ${suggestion.goal}`,
      `Step ${index + 1}: ${step.title}`,
      `Estimate: ${step.durationMinutes} minutes`,
      `Suggested day offset: ${step.suggestedDayOffset}`,
      step.suggestedHour === undefined ? '' : `Suggested hour: ${step.suggestedHour}:00`,
      step.description ? `Description: ${step.description}` : '',
      suggestion.notes ? `Goal notes: ${suggestion.notes}` : '',
      '',
      'Step JSON:',
      JSON.stringify(step, null, 2),
      '',
      'Full goal JSON:',
      JSON.stringify(suggestion, null, 2),
    ]
      .filter(Boolean)
      .join('\n'),
    energyNeeded: step.energyNeeded,
    etaMinutes: step.durationMinutes,
    priority: step.priority,
    title: compactTitle(step.title),
  }
}

function suggestionToTodos(suggestion: AIBreakdownResult, focusedDate: string, config: RuntimeConfig) {
  return suggestion.steps.map((step, index) => stepToTodo(suggestion, step, index, focusedDate, config))
}

function modelForProvider(provider: AIProvider, config: RuntimeConfig): string {
  if (provider === 'local') return 'local'
  return config.aiApiModel
}

function configWithProviderModel(
  config: RuntimeConfig,
  provider: AIProvider,
  model: string,
): RuntimeConfig {
  if (provider === 'local') return config
  return { ...config, aiApiModel: model }
}

function toScheduledEventFromTodo(
  todo: Todo,
  options: {
    date: string
    defaultStartTime: string
    endAt?: string
    startAt?: string
  },
) {
  const startAt =
    options.startAt ?? new Date(`${options.date}T${options.defaultStartTime}:00`).toISOString()
  const endAt =
    options.endAt ?? new Date(new Date(startAt).getTime() + todo.etaMinutes * 60_000).toISOString()

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

function eventDraftFromCreateAction(action: Extract<AIAction, { type: 'create_event' }>): EventDraft {
  return {
    allDay: action.allDay,
    description: action.description,
    displayDetails: action.displayDetails,
    endAt: action.endAt,
    eventTypeId: action.eventTypeId,
    startAt: action.startAt,
    title: action.title,
  }
}

export function useAI() {
  const error = useAIStore((state) => state.error)
  const isAvailable = useAIStore((state) => state.isAvailable)
  const isLoading = useAIStore((state) => state.isLoading)
  const model = useAIStore((state) => state.model)
  const conversationContext = useAIStore((state) => state.conversationContext)
  const messages = useAIStore((state) => state.messages)
  const pendingActionPlan = useAIStore((state) => state.pendingActionPlan)
  const pendingEnabledToolRoute = useAIStore((state) => state.pendingEnabledToolRoute)
  const pendingSuggestion = useAIStore((state) => state.pendingSuggestion)
  const provider = useAIStore((state) => state.provider)
  const clearActionPlan = useAIStore((state) => state.clearActionPlan)
  const clearEnabledToolRoute = useAIStore((state) => state.clearEnabledToolRoute)
  const clearHistory = useAIStore((state) => state.clearHistory)
  const confirmEnabledToolRouteInStore = useAIStore((state) => state.confirmEnabledToolRoute)
  const dismissSuggestion = useAIStore((state) => state.dismissSuggestion)
  const markActionPlanApplied = useAIStore((state) => state.markActionPlanApplied)
  const markSuggestionAccepted = useAIStore((state) => state.acceptSuggestion)
  const sendActionCommandToStore = useAIStore((state) => state.sendActionCommand)
  const sendConversationMessageToStore = useAIStore((state) => state.sendConversationMessage)
  const sendGoal = useAIStore((state) => state.sendGoal)
  const setStoreModel = useAIStore((state) => state.setModel)
  const setStoreProvider = useAIStore((state) => state.setProvider)
  const startTodoStepConversation = useAIStore((state) => state.startTodoStepConversation)
  const config = useConfigStore((state) => state.config)
  const saveRuntimeConfig = useConfigStore((state) => state.saveRuntimeConfig)
  const focusedDate = useCalendarStore((state) => state.focusedDate)
  const events = useEventStore((state) => state.events)
  const createEvent = useEventStore((state) => state.createEvent)
  const updateEvent = useEventStore((state) => state.updateEvent)
  const deleteEvent = useEventStore((state) => state.deleteEvent)
  const eventTypes = useEventTypeStore((state) => state.eventTypes)
  const loadEventTypes = useEventTypeStore((state) => state.loadEventTypes)
  const todos = useTodoStore((state) => state.todos)
  const createTodo = useTodoStore((state) => state.createTodo)
  const updateTodo = useTodoStore((state) => state.updateTodo)
  const deleteTodo = useTodoStore((state) => state.deleteTodo)
  const loadTodos = useTodoStore((state) => state.loadTodos)
  const showWorkspaceCalendar = useUIStore((state) => state.showWorkspaceCalendar)

  useEffect(() => {
    if (!eventTypes.length) loadEventTypes().catch(() => undefined)
    loadTodos().catch(() => undefined)
  }, [eventTypes.length, loadEventTypes, loadTodos])

  function buildContext(options: AIComposerOptions = {}) {
    const timeContext = getLocalTimeContext(new Date(), config.timezoneOverride)
    const includeCalendarContext = options.includeCalendarContext !== false
    const includeTodoContext = options.includeTodoContext !== false

    return AICalendarContextSchema.parse({
      ...timeContext,
      focusedDate,
      today: timeContext.currentDate,
      events: includeCalendarContext ? events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        displayDetails: event.displayDetails,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        eventTypeId: event.eventTypeId,
      })) : [],
      todos: includeTodoContext ? todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        notes: todo.notes,
        status: todo.status,
        eventTypeId: todo.eventTypeId,
        dueDate: todo.dueDate,
        energyNeeded: todo.energyNeeded,
        etaMinutes: todo.etaMinutes,
        priority: todo.priority,
        linkedEventId: todo.linkedEventId,
      })) : [],
      eventTypes: eventTypes.map((eventType) => ({
        id: eventType.id,
        label: eventType.label,
        appliesTo: eventType.appliesTo,
        isArchived: eventType.isArchived,
      })),
    })
  }

  async function acceptSuggestion() {
    if (!pendingSuggestion) return

    for (const step of pendingSuggestion.steps) {
      const start = scheduledStart(focusedDate, step)
      const end = new Date(start.getTime() + step.durationMinutes * 60_000)
      const draft = {
        color: priorityColor(step.priority),
        description: step.description,
        endAt: end.toISOString(),
        startAt: start.toISOString(),
        title: step.title,
      }

      if (isDuplicateEventDraft(draft, useEventStore.getState().events)) continue

      await createEvent(draft)
    }

    markSuggestionAccepted()
    showWorkspaceCalendar()
  }

  async function sendActionCommand(command: string, options: AIComposerOptions = {}) {
    await sendActionCommandToStore(command, buildContext(options), {
      allowEnabledToolRouting: options.allowActiveToolRouting,
      confirmEnabledToolRouting:
        options.confirmActiveToolRouting ?? config.confirmEnabledToolRouting,
    })
  }

  async function sendConversationMessage(message: string, options: AIComposerOptions = {}) {
    await sendConversationMessageToStore(message, buildContext(options), {
      allowEnabledToolRouting: options.allowActiveToolRouting,
      confirmEnabledToolRouting:
        options.confirmActiveToolRouting ?? config.confirmEnabledToolRouting,
    })
  }

  async function confirmEnabledToolRoute() {
    await confirmEnabledToolRouteInStore(buildContext())
  }

  function startTaskStepConversation(
    conversationContext: Extract<AIConversationContext, { kind: 'todo-step-refinement' }>,
  ) {
    startTodoStepConversation(conversationContext)
  }

  function setProvider(nextProvider: AIProvider) {
    const nextModel = modelForProvider(nextProvider, config)
    saveRuntimeConfig({ ...config, aiProvider: nextProvider })
    setStoreProvider(nextProvider)
    setStoreModel(nextModel)
  }

  function setModel(nextModel: string) {
    const trimmedModel = nextModel.trim()
    const saved = saveRuntimeConfig(configWithProviderModel(config, provider, trimmedModel || model))
    setStoreModel(modelForProvider(provider, saved))
  }

  async function applyAction(action: AIAction): Promise<'applied' | 'skipped_duplicate'> {
    if (action.type === 'create_event') {
      const draft = eventDraftFromCreateAction(action)

      if (isDuplicateEventDraft(draft, useEventStore.getState().events)) {
        return 'skipped_duplicate'
      }

      await createEvent(draft)
      return 'applied'
    }

    if (action.type === 'update_event') {
      await updateEvent(action.eventId, action.changes)
      return 'applied'
    }

    if (action.type === 'delete_event') {
      await deleteEvent(action.eventId)
      return 'applied'
    }

    if (action.type === 'create_todo') {
      await createTodo({
        title: action.title,
        notes: action.notes,
        dueDate: action.dueDate,
        energyNeeded: action.energyNeeded,
        etaMinutes: action.etaMinutes,
        priority: action.priority,
        eventTypeId: action.eventTypeId,
      })
      return 'applied'
    }

    if (action.type === 'update_todo') {
      await updateTodo(action.todoId, action.changes)
      return 'applied'
    }

    if (action.type === 'delete_todo') {
      await deleteTodo(action.todoId)
      return 'applied'
    }

    const todo = useTodoStore.getState().todos.find((candidate) => candidate.id === action.todoId)
    if (!todo) throw new Error(`Todo not found: ${action.todoId}`)

    const event = await createEvent(
      toScheduledEventFromTodo(todo, {
        date: action.date ?? todo.dueDate ?? focusedDate,
        defaultStartTime: config.defaultEventStartTime,
        endAt: action.endAt,
        startAt: action.startAt,
      }),
    )
    await updateTodo(todo.id, { linkedEventId: event.id })
    return 'applied'
  }

  async function applyActionPlan() {
    if (!pendingActionPlan) return { appliedCount: 0, skippedDuplicateCount: 0 }

    let appliedCount = 0
    let skippedDuplicateCount = 0
    for (const action of pendingActionPlan.actions) {
      const result = await applyAction(action)
      if (result === 'skipped_duplicate') {
        skippedDuplicateCount += 1
      } else {
        appliedCount += 1
      }
    }

    markActionPlanApplied()
    showWorkspaceCalendar()

    return { appliedCount, skippedDuplicateCount }
  }

  async function addAssistantResultToTodo() {
    const created: Todo[] = []

    if (pendingActionPlan) {
      for (const draft of planToTodos(pendingActionPlan, config)) {
        created.push(await createTodo(draft))
      }

      return created
    }

    if (pendingSuggestion) {
      for (const draft of suggestionToTodos(pendingSuggestion, focusedDate, config)) {
        created.push(await createTodo(draft))
      }

      return created
    }

    throw new Error('No AI result to add to tasks')
  }

  return {
    acceptSuggestion,
    addAssistantResultToTodo,
    applyActionPlan,
    breakdownGoal: sendGoal,
    clearActionPlan,
    clearEnabledToolRoute,
    clearHistory,
    confirmEnabledToolRoute,
    currentModel: model,
    currentProvider: provider,
    conversationContext,
    dismissSuggestion,
    error,
    isAvailable,
    isLoading,
    loading: isLoading,
    model,
    messages,
    pendingActionPlan,
    pendingEnabledToolRoute,
    pendingSuggestion,
    provider,
    sendActionCommand,
    sendConversationMessage,
    sendGoal,
    setModel,
    setProvider,
    suggestions: pendingSuggestion,
    startTaskStepConversation,
    timeContext: getLocalTimeContext(new Date(), config.timezoneOverride),
  }
}
