import { useEffect } from 'react'
import { addDays, set } from 'date-fns'

import { isDuplicateEventDraft } from '../domain/logic/eventDeduplication'
import { getLocalTimeContext } from '../domain/logic/timeContext'
import { AICalendarContextSchema } from '../domain/schemas/ai.schema'
import type {
  AIAction,
  AIBreakdownResult,
  AICalendarActionPlan,
  AIStep,
  CalendarBatchAction,
  RuntimeConfig,
  Todo,
} from '../domain/types'
import type { AIConversationContext } from '../domain/types/aiConversation'
import { calendarActionBatchGateway } from '../store/calendarActionBatchStore'
import {
  persistAIConversationMessages,
  retryAIConversationSave,
  getAISessionEpoch,
  getAIRequestGeneration,
  useAIStore,
} from '../store/aiStore'
import type { AIPlanOperation } from '../domain/schemas/aiPlanReview.schema'
import type { ApprovalDrawerOpenInput } from '../store/uiStore'
import { useCalendarStore } from '../store/calendarStore'
import { useConfigStore } from '../store/configStore'
import { useEventStore } from '../store/eventStore'
import { useEventTypeStore } from '../store/eventTypeStore'
import { useTodoStore } from '../store/todoStore'
import { requestScheduleRecompute } from '../store/schedulingStore'
import { useUIStore } from '../store/uiStore'

export type { AIMessage, PendingToolTemplateActivation } from '../store/aiStore'

export type AIComposerOptions = {
  allowActiveToolRouting?: boolean
  confirmActiveToolRouting?: boolean
  includeCalendarContext?: boolean
  includeTodoContext?: boolean
  recordToolCreationJourney?: boolean
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
  if (action.type === 'update_event')
    return action.changes.title ?? `Update event ${action.eventId}`
  if (action.type === 'delete_event') return `Delete event ${action.eventId}`
  if (action.type === 'create_todo') return action.title
  if (action.type === 'update_todo') return action.changes.title ?? `Update task ${action.todoId}`
  if (action.type === 'delete_todo') return `Delete task ${action.todoId}`
  return `Schedule task ${action.todoId}`
}

function actionNotesLine(action: AIAction): string {
  const title = actionTitle(action)

  if (action.type === 'create_event')
    return `${action.type}: ${title} (${action.startAt} - ${action.endAt})`
  if (action.type === 'update_event')
    return `${action.type}: ${title} (${JSON.stringify(action.changes)})`
  if (action.type === 'create_todo')
    return `${action.type}: ${title}${action.dueDate ? ` (due ${action.dueDate})` : ''}`
  if (action.type === 'update_todo')
    return `${action.type}: ${title} (${JSON.stringify(action.changes)})`
  if (action.type === 'schedule_todo') {
    const when =
      action.startAt && action.endAt ? `${action.startAt} - ${action.endAt}` : action.date
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
  if (action.type === 'schedule_todo')
    return action.startAt ? localDateFromDateTime(action.startAt) : action.date
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
  if (action.type === 'update_todo' && action.changes.energyNeeded)
    return action.changes.energyNeeded
  return 'medium'
}

function actionEventTypeId(action: AIAction, config: RuntimeConfig): string {
  if ('eventTypeId' in action && action.eventTypeId) return action.eventTypeId
  if (action.type === 'update_event' && action.changes.eventTypeId)
    return action.changes.eventTypeId
  if (action.type === 'update_todo' && action.changes.eventTypeId) return action.changes.eventTypeId
  return config.defaultTodoEventTypeId
}

function actionToTodo(
  plan: AICalendarActionPlan,
  action: AIAction,
  index: number,
  config: RuntimeConfig,
) {
  return {
    dueDate: actionDueDateFor(action),
    eventTypeId: actionEventTypeId(action, config),
    notes: [
      'AI Assistant action',
      '',
      `Summary: ${plan.summary}`,
      `Action ${index + 1}: ${actionNotesLine(action)}`,
      action.reason ? `Reason: ${action.reason}` : '',
      ...(plan.warnings.length
        ? ['', 'Warnings:', ...plan.warnings.map((warning) => `- ${warning}`)]
        : []),
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

function suggestionToTodos(
  suggestion: AIBreakdownResult,
  focusedDate: string,
  config: RuntimeConfig,
) {
  return suggestion.steps.map((step, index) =>
    stepToTodo(suggestion, step, index, focusedDate, config),
  )
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

function eventDraftFromCreateAction(
  action: Extract<AIAction, { type: 'create_event' }>,
): Extract<CalendarBatchAction, { type: 'create_event' }>['event'] {
  return {
    allDay: action.allDay ?? false,
    description: action.description,
    displayDetails: action.displayDetails,
    endAt: action.endAt,
    eventTypeId: action.eventTypeId,
    startAt: action.startAt,
    title: action.title,
  }
}

function actionToBatchAction(
  action: AIAction,
  index: number,
  options: { config: RuntimeConfig; focusedDate: string; todos: Todo[] },
): CalendarBatchAction {
  const clientActionId = `ai-${index + 1}`
  if (action.type === 'create_event') {
    return {
      clientActionId,
      event: eventDraftFromCreateAction(action),
      skipIfDuplicate: true,
      type: action.type,
    }
  }
  if (action.type === 'update_event') {
    return { changes: action.changes, clientActionId, eventId: action.eventId, type: action.type }
  }
  if (action.type === 'delete_event') {
    return { clientActionId, eventId: action.eventId, type: action.type }
  }
  if (action.type === 'create_todo') {
    return {
      clientActionId,
      todo: {
        dueDate: action.dueDate,
        energyNeeded: action.energyNeeded,
        etaMinutes: action.etaMinutes,
        eventTypeId: action.eventTypeId,
        notes: action.notes,
        priority: action.priority,
        status: 'todo',
        title: action.title,
      },
      type: action.type,
    }
  }
  if (action.type === 'update_todo') {
    return { changes: action.changes, clientActionId, todoId: action.todoId, type: action.type }
  }
  if (action.type === 'delete_todo') {
    return { clientActionId, todoId: action.todoId, type: action.type }
  }

  const todo = options.todos.find((candidate) => candidate.id === action.todoId)
  if (!todo) throw new Error(`Todo not found: ${action.todoId}`)
  return {
    clientActionId,
    event: toScheduledEventFromTodo(todo, {
      date: action.date ?? todo.dueDate ?? options.focusedDate,
      defaultStartTime: options.config.defaultEventStartTime,
      endAt: action.endAt,
      startAt: action.startAt,
    }),
    todoId: action.todoId,
    type: action.type,
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
  const pendingToolTemplateActivation = useAIStore((state) => state.pendingToolTemplateActivation)
  const pendingSuggestion = useAIStore((state) => state.pendingSuggestion)
  const provider = useAIStore((state) => state.provider)
  const selectedEnabledToolProjectId = useAIStore((state) => state.selectedEnabledToolProjectId)
  const setSelectedEnabledToolProjectId = useAIStore(
    (state) => state.setSelectedEnabledToolProjectId,
  )
  const clearActionPlan = useAIStore((state) => state.clearActionPlan)
  const clearEnabledToolRoute = useAIStore((state) => state.clearEnabledToolRoute)
  const clearHistory = useAIStore((state) => state.clearHistory)
  const clearToolTemplateActivation = useAIStore((state) => state.clearToolTemplateActivation)
  const confirmEnabledToolRouteInStore = useAIStore((state) => state.confirmEnabledToolRoute)
  const continueWithoutToolTemplateActivationInStore = useAIStore(
    (state) => state.continueWithoutToolTemplateActivation,
  )
  const dismissSuggestion = useAIStore((state) => state.dismissSuggestion)
  const actionPlanRecord = useAIStore((state) => state.actionPlanRecord)
  const isSavingConversation = useAIStore((state) => state.isSavingConversation)
  const conversationSaveFailed = useAIStore((state) => state.conversationSaveFailed)
  const markSuggestionAccepted = useAIStore((state) => state.acceptSuggestion)
  const sendActionCommandToStore = useAIStore((state) => state.sendActionCommand)
  const sendConversationMessageToStore = useAIStore((state) => state.sendConversationMessage)
  const sendGoal = useAIStore((state) => state.sendGoal)
  const startTodoStepConversation = useAIStore((state) => state.startTodoStepConversation)
  const config = useConfigStore((state) => state.config)
  const focusedDate = useCalendarStore((state) => state.focusedDate)
  const events = useEventStore((state) => state.events)
  const createEvent = useEventStore((state) => state.createEvent)
  const reconcileEvents = useEventStore((state) => state.reconcileBatch)
  const eventTypes = useEventTypeStore((state) => state.eventTypes)
  const loadEventTypes = useEventTypeStore((state) => state.loadEventTypes)
  const todos = useTodoStore((state) => state.todos)
  const createTodo = useTodoStore((state) => state.createTodo)
  const reconcileTodos = useTodoStore((state) => state.reconcileBatch)
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
      events: includeCalendarContext
        ? events.map((event) => ({
            id: event.id,
            title: event.title,
            description: event.description,
            displayDetails: event.displayDetails,
            startAt: event.startAt,
            endAt: event.endAt,
            allDay: event.allDay,
            eventTypeId: event.eventTypeId,
          }))
        : [],
      todos: includeTodoContext
        ? todos.map((todo) => ({
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
          }))
        : [],
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

  async function runAndPersist(action: () => Promise<void>, title: string) {
    const epoch = getAISessionEpoch()
    const existingIds = new Set(useAIStore.getState().messages.map((message) => message.id))
    const pending = action()
    const generation = getAIRequestGeneration()
    await pending
    if (epoch !== getAISessionEpoch() || generation !== getAIRequestGeneration()) return
    const state = useAIStore.getState()
    await persistAIConversationMessages(
      state.messages.filter((message) => !existingIds.has(message.id)),
      title,
      {
        actionPlan: state.pendingActionPlan ?? undefined,
        conversationContext: state.conversationContext ?? undefined,
        suggestion: state.pendingSuggestion ?? undefined,
      },
    )
  }

  async function sendActionCommand(command: string, options: AIComposerOptions = {}) {
    await runAndPersist(
      () =>
        sendActionCommandToStore(command, buildContext(options), {
          allowEnabledToolRouting: options.allowActiveToolRouting,
          confirmEnabledToolRouting:
            options.confirmActiveToolRouting ?? config.confirmEnabledToolRouting,
        }),
      command,
    )
  }

  async function sendConversationMessage(message: string, options: AIComposerOptions = {}) {
    await runAndPersist(
      () =>
        sendConversationMessageToStore(message, buildContext(options), {
          allowEnabledToolRouting: options.allowActiveToolRouting,
          recordToolCreationJourney: options.recordToolCreationJourney,
          confirmEnabledToolRouting:
            options.confirmActiveToolRouting ?? config.confirmEnabledToolRouting,
        }),
      message,
    )
  }

  async function sendGoalWithPersistence(goal: string) {
    await runAndPersist(() => sendGoal(goal), goal)
  }

  async function confirmEnabledToolRoute() {
    await runAndPersist(() => confirmEnabledToolRouteInStore(buildContext()), 'Tool conversation')
  }

  async function continueWithoutToolTemplateActivation() {
    await runAndPersist(
      () => continueWithoutToolTemplateActivationInStore(buildContext()),
      'AI conversation',
    )
  }

  function startTaskStepConversation(
    conversationContext: Extract<AIConversationContext, { kind: 'todo-step-refinement' }>,
  ) {
    startTodoStepConversation(conversationContext)
  }

  type PlanSnapshot = Extract<ApprovalDrawerOpenInput, { source: 'ai-action-plan' }>

  function snapshotPlan(): PlanSnapshot {
    const record = useAIStore.getState().actionPlanRecord
    if (!record?.review || record.review.dismissed || useAIStore.getState().isSavingConversation)
      throw new Error('Save a new AI plan before reviewing it.')
    return structuredClone({
      source: 'ai-action-plan',
      plan: record.plan,
      record,
      sessionEpoch: getAISessionEpoch(),
      applyActions:
        record.review.operations.apply.status === 'applied'
          ? []
          : record.plan.actions.map((action, index) =>
              actionToBatchAction(action, index, {
                config,
                focusedDate,
                todos: useTodoStore.getState().todos,
              }),
            ),
      taskActions: planToTodos(record.plan, config).map((todo, index) => ({
        type: 'create_todo' as const,
        clientActionId: `task-${index + 1}`,
        todo: { ...todo, status: 'todo' as const },
      })),
    })
  }

  function reviewActionPlan() {
    try {
      useUIStore.getState().openApprovalDrawer(snapshotPlan())
    } catch (error) {
      useAIStore.setState({
        error: error instanceof Error ? error.message : 'Unable to review plan',
      })
    }
  }

  async function executePlan(snapshot: PlanSnapshot, operation: AIPlanOperation) {
    const record = snapshot.record
    const actions = operation === 'apply' ? snapshot.applyActions : snapshot.taskActions
    if (
      !record?.review ||
      record.review.dismissed ||
      !actions ||
      snapshot.sessionEpoch !== getAISessionEpoch()
    )
      throw new Error('This review is no longer available. Open the saved plan again.')
    const epoch = getAISessionEpoch()
    const result = await calendarActionBatchGateway.apply({
      actions,
      aiPlanRef: record.ref,
      aiPlanOperation: operation,
      idempotencyKey: `ai-${record.ref.messageId}-${operation}`,
      source: 'ai-action-plan',
    })
    if (epoch !== getAISessionEpoch()) throw new Error('The user session changed.')
    reconcileEvents(result.eventsUpserted, result.deletedEventIds)
    reconcileTodos(result.todosUpserted, result.deletedTodoIds)
    requestScheduleRecompute('calendar_batch_applied')
    const review = result.aiPlanReview
    if (review) {
      const current = useAIStore.getState().actionPlanRecord
      if (
        current?.ref.messageId === record.ref.messageId &&
        current.ref.threadId === record.ref.threadId
      ) {
        useAIStore.setState({
          actionPlanRecord: { ...current, review },
          pendingActionPlan:
            review.operations.apply.status === 'pending' && !review.dismissed ? current.plan : null,
        })
      }
      const drawer = useUIStore.getState().approvalDrawerContext
      if (
        drawer?.source === 'ai-action-plan' &&
        drawer.record?.ref.messageId === record.ref.messageId
      ) {
        useUIStore.setState({ approvalDrawerContext: { ...drawer, record: { ...record, review } } })
      }
    }
    return result
  }

  async function applyActionPlan(snapshot: PlanSnapshot) {
    const result = await executePlan(snapshot, 'apply')
    showWorkspaceCalendar()
    return {
      appliedCount: result.results.filter((entry) => entry.status === 'applied').length,
      replayed: result.replayed,
      skippedDuplicateCount: result.results.filter((entry) => entry.status === 'skipped_duplicate')
        .length,
    }
  }

  async function addAssistantResultToTodo(snapshot?: PlanSnapshot) {
    if (snapshot || actionPlanRecord)
      return (await executePlan(snapshot ?? snapshotPlan(), 'copy_to_todos')).todosUpserted
    const created: Todo[] = []
    if (pendingSuggestion) {
      for (const draft of suggestionToTodos(pendingSuggestion, focusedDate, config)) {
        created.push(await createTodo(draft))
      }

      return created
    }

    throw new Error('No AI result to add to tasks')
  }

  return {
    actionPlanRecord,
    isSavingConversation,
    conversationSaveFailed,
    retryConversationSave: retryAIConversationSave,
    reviewActionPlan,
    acceptSuggestion,
    addAssistantResultToTodo,
    applyActionPlan,
    breakdownGoal: sendGoalWithPersistence,
    clearActionPlan,
    clearEnabledToolRoute,
    clearHistory,
    clearToolTemplateActivation,
    confirmEnabledToolRoute,
    continueWithoutToolTemplateActivation,
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
    pendingToolTemplateActivation,
    provider,
    sendActionCommand,
    sendConversationMessage,
    sendGoal: sendGoalWithPersistence,
    selectedEnabledToolProjectId,
    setSelectedEnabledToolProjectId,
    suggestions: pendingSuggestion,
    startTaskStepConversation,
    timeContext: getLocalTimeContext(new Date(), config.timezoneOverride),
  }
}
