import { create } from 'zustand'

import type {
  AIAction,
  AIProvider,
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
} from '../domain/types'
import { AIEnabledToolRouteRequestSchema } from '../domain/schemas/ai.schema'
import {
  activeToolRouteSummary,
  activeToolsFromProjects,
  createActiveToolMetadata,
  type ActiveTool,
} from '../domain/logic/enabledTools'
import {
  activationAccuracyWarnings,
  activationFormDraftForTemplate,
  findToolTemplateIntent,
  instantiableToolTemplates,
  missingRecommendedActivationFields,
  templateToolName,
  type ToolTemplateMetadata,
} from '../domain/logic/toolTemplateMetadata'
import {
  TIME_CONFIRMATION_WARNING_PREFIX,
  TIME_CONFLICT_WARNING_PREFIX,
} from '../domain/types/aiWarnings'
import type { AIConversationContext } from '../domain/types/aiConversation'
import { dispatchEnabledToolInstance } from './enabledToolRunner'
import { useLongTermMemoryStore } from './longTermMemoryStore'
import { useUIStore } from './uiStore'
import type { IAIService } from '../services/ai/IAIService'

const NEAR_TERM_CONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000

type TimedBlock = {
  end: Date
  eventId?: string
  label: string
  start: Date
}

export type AIMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type PendingEnabledToolRoute = {
  confidence: number
  instanceAlias: string
  originalMessage: string
  projectId: string
  reason: string
  rewrittenInstruction: string
  toolName: string
}

export type PendingToolTemplateActivation = {
  activationFields: NonNullable<ToolTemplateMetadata['activationFields']>
  activationFormDraft: Record<string, string>
  confidence: number
  matchedTerms: string[]
  missingRecommendedFieldIds: string[]
  originalMessage: string
  reason: string
  template: ToolTemplateMetadata
}

type EnabledToolRoutingOptions = {
  allowEnabledToolRouting?: boolean
  confirmEnabledToolRouting?: boolean
}

export type AIStore = {
  error: string | null
  isAvailable: boolean
  isLoading: boolean
  model: string
  conversationContext: AIConversationContext | null
  messages: AIMessage[]
  pendingActionPlan: AICalendarActionPlan | null
  pendingEnabledToolRoute: PendingEnabledToolRoute | null
  pendingSuggestion: AIBreakdownResult | null
  pendingToolTemplateActivation: PendingToolTemplateActivation | null
  provider: AIProvider
  acceptSuggestion: () => void
  clearActionPlan: () => void
  clearEnabledToolRoute: () => void
  clearHistory: () => void
  clearToolTemplateActivation: () => void
  confirmEnabledToolRoute: (context: AICalendarContext) => Promise<void>
  confirmToolTemplateActivation: (formDraft?: Record<string, string>) => Promise<void>
  continueWithoutToolTemplateActivation: (context: AICalendarContext) => Promise<void>
  dismissSuggestion: () => void
  markActionPlanApplied: () => void
  setModel: (model: string) => void
  setProvider: (provider: AIProvider) => void
  sendConversationMessage: (
    message: string,
    context: AICalendarContext,
    options?: EnabledToolRoutingOptions,
  ) => Promise<void>
  sendActionCommand: (
    command: string,
    context: AICalendarContext,
    options?: EnabledToolRoutingOptions,
  ) => Promise<void>
  sendGoal: (goal: string) => Promise<void>
  startTodoStepConversation: (
    context: Extract<AIConversationContext, { kind: 'todo-step-refinement' }>,
  ) => void
  reset: () => void
}

let aiService: IAIService | null = null

export function configureAIService(
  service: IAIService | null,
  metadata?: { model?: string; provider?: AIProvider },
) {
  aiService = service
  useAIStore.setState((state) => ({
    isAvailable: Boolean(service?.isAvailable()),
    model: metadata?.model ?? state.model,
    provider: metadata?.provider ?? state.provider,
  }))
}

export function getConfiguredAIService(): IAIService | null {
  return aiService
}

function createMessage(role: AIMessage['role'], content: string): AIMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

function selectedTodoStepsMessage(
  context: Extract<AIConversationContext, { kind: 'todo-step-refinement' }>,
): string {
  return [
    `Selected ${context.selectedItems.length} item${context.selectedItems.length === 1 ? '' : 's'} from task "${context.todoTitle}" for AI refinement:`,
    ...context.selectedItems.map(
      (item) =>
        `${item.itemLabel} ${item.itemIndex + 1}${item.completed ? ' (completed)' : ''}: ${item.value}`,
    ),
  ].join('\n')
}

function draftActionPlanContext(
  plan: AICalendarActionPlan,
): Extract<AIConversationContext, { kind: 'draft-action-plan' }> {
  return {
    actionPlan: plan,
    kind: 'draft-action-plan',
    title: plan.summary,
  }
}

async function allActiveToolInstances(): Promise<ActiveTool[]> {
  const memory = useLongTermMemoryStore.getState()
  try {
    await memory.loadOverview()
  } catch {
    return []
  }
  const latest = useLongTermMemoryStore.getState()

  return activeToolsFromProjects(latest.projects, latest.goals).filter(
    (instance) => instance.status === 'active',
  )
}

async function activeToolInstances(): Promise<ActiveTool[]> {
  return (await allActiveToolInstances()).filter((instance) => instance.routingEnabled)
}

async function findToolTemplateActivation(
  message: string,
): Promise<PendingToolTemplateActivation | null> {
  const activeInstances = await allActiveToolInstances()
  const activeSourceToolIds = new Set(activeInstances.map((instance) => instance.sourceToolId))
  const candidates = instantiableToolTemplates().filter(
    (template) => !activeSourceToolIds.has(template.id),
  )
  const match = findToolTemplateIntent(message, candidates)
  if (!match) return null

  const activationFormDraft = activationFormDraftForTemplate(match.template, message)

  return {
    activationFields: match.template.activationFields ?? [],
    activationFormDraft,
    confidence: match.confidence,
    matchedTerms: match.matchedTerms,
    missingRecommendedFieldIds: missingRecommendedActivationFields(
      match.template,
      activationFormDraft,
    ).map((field) => field.id),
    originalMessage: message,
    reason: match.reason,
    template: match.template,
  }
}

function hasOwnRecordValue(record: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function mergeActivationForm(
  template: ToolTemplateMetadata,
  resultForm: Record<string, string>,
  draftForm: Record<string, string>,
): Record<string, string> {
  const fields = template.activationFields ?? []
  if (!fields.length) return { ...resultForm, ...draftForm }

  return {
    ...resultForm,
    ...Object.fromEntries(
      fields.map((field) => {
        if (hasOwnRecordValue(draftForm, field.id)) return [field.id, draftForm[field.id] ?? '']
        return [field.id, resultForm[field.id] ?? field.defaultValue ?? '']
      }),
    ),
  }
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    output.push(trimmed)
  }

  return output
}

async function findEnabledToolRoute(
  service: IAIService,
  message: string,
  context: AICalendarContext,
): Promise<{ instance: ActiveTool; route: PendingEnabledToolRoute } | null> {
  const instances = await activeToolInstances()
  if (!instances.length) return null

  const request = AIEnabledToolRouteRequestSchema.parse({
    currentDate: context.currentDate,
    currentDateTime: context.currentDateTime,
    enabledTools: instances.map(activeToolRouteSummary),
    focusedDate: context.focusedDate,
    today: context.today,
    userMessage: message,
  })
  const result = await service.routeEnabledTool(request)
  if (!result.matchedProjectId || result.confidence < 0.45) return null

  const instance = instances.find((candidate) => candidate.projectId === result.matchedProjectId)
  if (!instance) return null

  return {
    instance,
    route: {
      confidence: result.confidence,
      instanceAlias: instance.instanceAlias,
      originalMessage: message,
      projectId: instance.projectId,
      reason: result.reason,
      rewrittenInstruction: result.rewrittenInstruction,
      toolName: instance.toolName,
    },
  }
}

async function dispatchRoute(
  route: PendingEnabledToolRoute,
  context: AICalendarContext,
  service: IAIService,
) {
  const instances = await activeToolInstances()
  const instance = instances.find((candidate) => candidate.projectId === route.projectId)
  if (!instance) throw new Error(`Active tool not found: ${route.projectId}`)

  return dispatchEnabledToolInstance(instance, route.rewrittenInstruction, context, service)
}

function actionStartAt(action: AIAction): string | null {
  if (action.type === 'create_event') return action.startAt
  if (action.type === 'update_event') return action.changes.startAt ?? null
  return null
}

function actionEndAt(action: AIAction): string | null {
  if (action.type === 'create_event') return action.endAt
  if (action.type === 'update_event') return action.changes.endAt ?? null
  return null
}

function actionLabel(action: AIAction): string {
  if (action.type === 'create_event') return action.title
  if (action.type === 'update_event') return action.changes.title ?? `event ${action.eventId}`
  return action.type.replace(/_/g, ' ')
}

function formatActionTime(date: Date, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }
}

function timeRangeLabel(start: Date, end: Date, context: AICalendarContext): string {
  return `${formatActionTime(start, context.timezone)} - ${formatActionTime(end, context.timezone)}`
}

function confirmationWarning(action: AIAction, context: AICalendarContext): string | null {
  const startAt = actionStartAt(action)
  if (!startAt) return null

  const now = new Date(context.currentDateTime ?? new Date().toISOString())
  const start = new Date(startAt)
  const endAt = actionEndAt(action)
  const end = endAt ? new Date(endAt) : null

  if (Number.isNaN(now.getTime()) || Number.isNaN(start.getTime())) return null
  if (end && Number.isNaN(end.getTime())) return null

  const startsInMs = start.getTime() - now.getTime()
  if (startsInMs < 0 || startsInMs > NEAR_TERM_CONFIRMATION_WINDOW_MS) return null

  const range = end
    ? timeRangeLabel(start, end, context)
    : formatActionTime(start, context.timezone)
  const timezone = context.timezone ? ` (${context.timezone})` : ''

  return `${TIME_CONFIRMATION_WARNING_PREFIX} ${actionLabel(action)} is scheduled for ${range}${timezone}. Review the time before applying.`
}

function plannedBlock(action: AIAction, context: AICalendarContext): TimedBlock | null {
  if (action.type === 'create_event') {
    const start = new Date(action.startAt)
    const end = new Date(action.endAt)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return { label: action.title, start, end }
  }

  if (action.type !== 'update_event') return null

  const existing = context.events.find((event) => event.id === action.eventId)
  const startAt = action.changes.startAt ?? existing?.startAt
  const endAt = action.changes.endAt ?? existing?.endAt

  if (!startAt || !endAt) return null

  const start = new Date(startAt)
  const end = new Date(endAt)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return {
    eventId: action.eventId,
    label: actionLabel(action),
    start,
    end,
  }
}

function eventBlock(event: AICalendarContext['events'][number]): TimedBlock | null {
  const start = new Date(event.startAt)
  const end = new Date(event.endAt)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return {
    eventId: event.id,
    label: event.title,
    start,
    end,
  }
}

function blocksOverlap(left: TimedBlock, right: TimedBlock): boolean {
  return left.start.getTime() < right.end.getTime() && right.start.getTime() < left.end.getTime()
}

function conflictWarnings(plan: AICalendarActionPlan, context: AICalendarContext): string[] {
  const warnings = new Set<string>()
  const plannedBlocks = plan.actions
    .map((action) => plannedBlock(action, context))
    .filter((block): block is TimedBlock => Boolean(block))
  const deletedEventIds = new Set(
    plan.actions.flatMap((action) => (action.type === 'delete_event' ? [action.eventId] : [])),
  )
  const existingBlocks = context.events
    .filter((event) => !deletedEventIds.has(event.id))
    .map(eventBlock)
    .filter((block): block is TimedBlock => Boolean(block))

  for (let index = 0; index < plannedBlocks.length; index += 1) {
    const left = plannedBlocks[index]

    for (const right of plannedBlocks.slice(index + 1)) {
      if (!blocksOverlap(left, right)) continue

      const duplicate =
        left.start.getTime() === right.start.getTime() && left.end.getTime() === right.end.getTime()
      const verb = duplicate ? 'duplicates' : 'overlaps'

      warnings.add(
        `${TIME_CONFLICT_WARNING_PREFIX} "${left.label}" ${verb} "${right.label}" at ${timeRangeLabel(
          left.start,
          left.end,
          context,
        )}. Adjust one of these times before applying.`,
      )
    }

    for (const existing of existingBlocks) {
      if (left.eventId && left.eventId === existing.eventId) continue
      if (!blocksOverlap(left, existing)) continue

      warnings.add(
        `${TIME_CONFLICT_WARNING_PREFIX} "${left.label}" overlaps existing event "${
          existing.label
        }" at ${timeRangeLabel(left.start, left.end, context)}. Adjust one of these times before applying.`,
      )
    }
  }

  return [...warnings]
}

function withTimeQualityWarnings(
  plan: AICalendarActionPlan,
  context: AICalendarContext,
): AICalendarActionPlan {
  const warnings = new Set(plan.warnings)

  for (const action of plan.actions) {
    const warning = confirmationWarning(action, context)
    if (warning) warnings.add(warning)
  }

  for (const warning of conflictWarnings(plan, context)) {
    warnings.add(warning)
  }

  if (warnings.size === plan.warnings.length) return plan

  return {
    ...plan,
    warnings: [...warnings],
  }
}

export const useAIStore = create<AIStore>((set, get) => ({
  error: null,
  isAvailable: false,
  isLoading: false,
  model: 'deepseek-chat',
  conversationContext: null,
  messages: [],
  pendingActionPlan: null,
  pendingEnabledToolRoute: null,
  pendingSuggestion: null,
  pendingToolTemplateActivation: null,
  provider: 'api',
  acceptSuggestion: () => set({ pendingSuggestion: null }),
  clearActionPlan: () => set({ pendingActionPlan: null }),
  clearEnabledToolRoute: () => set({ pendingEnabledToolRoute: null }),
  clearToolTemplateActivation: () => set({ pendingToolTemplateActivation: null }),
  clearHistory: () =>
    set({
      conversationContext: null,
      error: null,
      messages: [],
      pendingActionPlan: null,
      pendingEnabledToolRoute: null,
      pendingSuggestion: null,
      pendingToolTemplateActivation: null,
    }),
  dismissSuggestion: () => set({ pendingSuggestion: null }),
  markActionPlanApplied: () => set({ pendingActionPlan: null }),
  reset: () =>
    set({
      error: null,
      isAvailable: Boolean(aiService?.isAvailable()),
      isLoading: false,
      model: 'deepseek-chat',
      conversationContext: null,
      messages: [],
      pendingActionPlan: null,
      pendingEnabledToolRoute: null,
      pendingSuggestion: null,
      pendingToolTemplateActivation: null,
      provider: 'api',
    }),
  setModel: (model) => set({ model }),
  setProvider: (provider) => set({ provider }),
  startTodoStepConversation: (context) => {
    const contextMessage = createMessage('user', selectedTodoStepsMessage(context))
    const assistantMessage = createMessage(
      'assistant',
      'I have these selected task items. Tell me what to change, or ask me to rewrite them. If anything is unclear, I will ask follow-up questions first.',
    )

    set({
      conversationContext: context,
      error: null,
      messages: [contextMessage, assistantMessage],
      pendingActionPlan: null,
      pendingEnabledToolRoute: null,
      pendingSuggestion: null,
      pendingToolTemplateActivation: null,
    })
  },
  confirmEnabledToolRoute: async (context) => {
    const route = get().pendingEnabledToolRoute
    if (!route) return

    if (!aiService?.isAvailable()) {
      set({ error: 'Selected AI provider is not configured.', isAvailable: false })
      return
    }

    set({ error: null, isLoading: true })
    try {
      const result = await dispatchRoute(route, context, aiService)
      const assistantMessage = createMessage(
        'assistant',
        `${result.assistantReply}${
          result.calendarEventCount
            ? ` ${result.calendarEventCount} calendar draft${result.calendarEventCount === 1 ? '' : 's'} are waiting in Active Tools.`
            : ''
        }`,
      )
      useUIStore.getState().openEnabledToolsPanel(route.projectId)
      set((state) => ({
        isLoading: false,
        messages: [...state.messages, assistantMessage],
        pendingEnabledToolRoute: null,
        pendingToolTemplateActivation: null,
      }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to dispatch active tool route'
      set({ error: message, isLoading: false })
    }
  },
  confirmToolTemplateActivation: async (formDraft = {}) => {
    const pending = get().pendingToolTemplateActivation
    if (!pending) return

    if (!aiService?.isAvailable()) {
      set({ error: 'Selected AI provider is not configured.', isAvailable: false })
      return
    }

    set({ error: null, isLoading: true })
    try {
      const memory = useLongTermMemoryStore.getState()
      await memory.loadOverview().catch(() => undefined)
      const latest = useLongTermMemoryStore.getState()
      const existingAliases = activeToolsFromProjects(latest.projects, latest.goals).map(
        (instance) => instance.instanceAlias,
      )
      const activationFormDraft = { ...pending.activationFormDraft, ...formDraft }
      const result = await aiService.runToolActivation({
        activationFields: pending.activationFields,
        activationFormDraft,
        capabilityTags: pending.template.capabilityTags ?? [],
        existingInstanceAliases: existingAliases,
        messages: [{ content: pending.originalMessage, role: 'user' }],
        routeTags: pending.template.routeTags ?? [],
        sourceToolId: pending.template.id,
        templateDescription: pending.template.description ?? '',
        templateId: pending.template.id,
        templateLabel: pending.template.label,
        toolName: templateToolName(pending.template),
      })
      const activationForm = mergeActivationForm(
        pending.template,
        result.activationForm,
        activationFormDraft,
      )
      const warnings = uniqueNonEmpty([
        ...result.warnings,
        ...activationAccuracyWarnings(pending.template, activationForm),
      ])
      const activationSummary = warnings.length
        ? `${result.activationSummary}\n\nAccuracy notes:\n${warnings.map((warning) => `- ${warning}`).join('\n')}`
        : result.activationSummary
      const alias = result.suggestedInstanceAlias.trim() || pending.template.label
      const metadata = createActiveToolMetadata({
        activationForm,
        activationSummary,
        adapterId: pending.template.adapterId ?? 'generic',
        instanceAlias: alias,
        parentTemplateId: pending.template.id,
        parentTemplateLabel: pending.template.label,
        parentTemplateToolName: templateToolName(pending.template),
        routeTags: result.routeTags.length ? result.routeTags : (pending.template.routeTags ?? []),
        routingEnabled: true,
        sourceToolId: pending.template.id,
        templateId: pending.template.id,
        toolFeatures: pending.template.capabilityTags ?? [],
        toolKind: pending.template.toolKind,
        toolName: templateToolName(pending.template),
      })
      const goal = await memory.createGoal({
        description: activationSummary,
        metadata,
        title: alias,
      })
      const project = await memory.createProject({
        description: activationSummary,
        goal_id: goal.goal_id,
        metadata,
        title: alias,
      })
      await memory.loadOverview().catch(() => undefined)
      useUIStore.getState().openEnabledToolsPanel(project.project_id)
      const assistantMessage = createMessage(
        'assistant',
        `Registered "${alias}" from ${pending.template.label}. Opened Active Tools.${
          warnings.length ? ` ${warnings[0]}` : ''
        }`,
      )
      set((state) => ({
        isLoading: false,
        messages: [...state.messages, assistantMessage],
        pendingToolTemplateActivation: null,
      }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to enable this tool template'
      set({ error: message, isLoading: false })
    }
  },
  continueWithoutToolTemplateActivation: async (context) => {
    const pending = get().pendingToolTemplateActivation
    if (!pending) return

    if (!aiService?.isAvailable()) {
      set({ error: 'Selected AI provider is not configured.', isAvailable: false })
      return
    }

    const conversationContext = { kind: 'general' as const }
    const requestMessages = get().messages.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }))
    set({ error: null, isLoading: true, pendingToolTemplateActivation: null })

    try {
      const result = await aiService.continueConversation(
        requestMessages,
        context,
        conversationContext,
      )
      const assistantMessage = createMessage('assistant', result.reply)
      const actionPlan = result.actionPlan
        ? withTimeQualityWarnings(result.actionPlan, context)
        : null

      set((state) => ({
        conversationContext,
        isLoading: false,
        messages: [...state.messages, assistantMessage],
        pendingActionPlan: actionPlan ?? state.pendingActionPlan,
        pendingSuggestion: actionPlan ? null : state.pendingSuggestion,
      }))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to continue conversation'
      set({ error: errorMessage, isLoading: false })
    }
  },
  sendConversationMessage: async (message, context, options = {}) => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage) return

    if (!aiService?.isAvailable()) {
      set({ error: 'Selected AI provider is not configured.', isAvailable: false })
      return
    }

    const userMessage = createMessage('user', trimmedMessage)
    const pendingActionPlan = get().pendingActionPlan
    const currentConversationContext = get().conversationContext
    const conversationContext =
      get().conversationContext ??
      (pendingActionPlan ? draftActionPlanContext(pendingActionPlan) : { kind: 'general' })
    const requestMessages = [...get().messages, userMessage].map((entry) => ({
      role: entry.role,
      content: entry.content,
    }))

    set((state) => ({
      error: null,
      isLoading: true,
      messages: [...state.messages, userMessage],
      pendingEnabledToolRoute: null,
      pendingToolTemplateActivation: null,
    }))

    try {
      const canRouteToEnabledTool =
        options.allowEnabledToolRouting !== false &&
        !pendingActionPlan &&
        !currentConversationContext
      const routeMatch = canRouteToEnabledTool
        ? await findEnabledToolRoute(aiService, trimmedMessage, context)
        : null

      if (routeMatch) {
        if (options.confirmEnabledToolRouting !== false) {
          const assistantMessage = createMessage(
            'assistant',
            `Route this to ${routeMatch.route.instanceAlias} | ${routeMatch.route.toolName}? ${routeMatch.route.reason}`,
          )
          set((state) => ({
            isLoading: false,
            messages: [...state.messages, assistantMessage],
            pendingEnabledToolRoute: routeMatch.route,
            pendingToolTemplateActivation: null,
          }))
          return
        }

        const dispatchResult = await dispatchRoute(routeMatch.route, context, aiService)
        useUIStore.getState().openEnabledToolsPanel(routeMatch.route.projectId)
        const assistantMessage = createMessage(
          'assistant',
          `${dispatchResult.assistantReply}${
            dispatchResult.calendarEventCount
              ? ` ${dispatchResult.calendarEventCount} calendar draft${
                  dispatchResult.calendarEventCount === 1 ? '' : 's'
                } are waiting in Active Tools.`
              : ''
          }`,
        )
        set((state) => ({
          isLoading: false,
          messages: [...state.messages, assistantMessage],
          pendingEnabledToolRoute: null,
          pendingToolTemplateActivation: null,
        }))
        return
      }

      const templateMatch = canRouteToEnabledTool
        ? await findToolTemplateActivation(trimmedMessage)
        : null

      if (templateMatch) {
        set({
          isLoading: false,
          pendingToolTemplateActivation: templateMatch,
        })
        return
      }

      const result = await aiService.continueConversation(
        requestMessages,
        context,
        conversationContext,
      )
      const assistantMessage = createMessage('assistant', result.reply)
      const actionPlan = result.actionPlan
        ? withTimeQualityWarnings(result.actionPlan, context)
        : null

      set((state) => ({
        conversationContext,
        isLoading: false,
        messages: [...state.messages, assistantMessage],
        pendingActionPlan: actionPlan ?? state.pendingActionPlan,
        pendingEnabledToolRoute: null,
        pendingSuggestion: actionPlan ? null : state.pendingSuggestion,
        pendingToolTemplateActivation: null,
      }))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to continue conversation'
      set({ error: errorMessage, isLoading: false })
    }
  },
  sendActionCommand: async (command, context, options = {}) => {
    const trimmedCommand = command.trim()

    if (!trimmedCommand) return

    if (!aiService?.isAvailable()) {
      set({ error: 'Selected AI provider is not configured.', isAvailable: false })
      return
    }

    const userMessage = createMessage('user', trimmedCommand)
    set({
      conversationContext: null,
      error: null,
      isLoading: true,
      messages: [userMessage],
      pendingEnabledToolRoute: null,
      pendingSuggestion: null,
      pendingToolTemplateActivation: null,
    })

    try {
      const routeMatch =
        options.allowEnabledToolRouting === false
          ? null
          : await findEnabledToolRoute(aiService, trimmedCommand, context)
      if (routeMatch) {
        if (options.confirmEnabledToolRouting !== false) {
          const assistantMessage = createMessage(
            'assistant',
            `Route this to ${routeMatch.route.instanceAlias} | ${routeMatch.route.toolName}? ${routeMatch.route.reason}`,
          )
          set((state) => ({
            conversationContext: null,
            isLoading: false,
            messages: [...state.messages, assistantMessage],
            pendingActionPlan: null,
            pendingEnabledToolRoute: routeMatch.route,
            pendingToolTemplateActivation: null,
          }))
          return
        }

        const dispatchResult = await dispatchRoute(routeMatch.route, context, aiService)
        useUIStore.getState().openEnabledToolsPanel(routeMatch.route.projectId)
        const assistantMessage = createMessage(
          'assistant',
          `${dispatchResult.assistantReply}${
            dispatchResult.calendarEventCount
              ? ` ${dispatchResult.calendarEventCount} calendar draft${
                  dispatchResult.calendarEventCount === 1 ? '' : 's'
                } are waiting in Active Tools.`
              : ''
          }`,
        )
        set((state) => ({
          conversationContext: null,
          isLoading: false,
          messages: [...state.messages, assistantMessage],
          pendingActionPlan: null,
          pendingEnabledToolRoute: null,
          pendingToolTemplateActivation: null,
        }))
        return
      }

      const result = withTimeQualityWarnings(
        await aiService.planCalendarActions(trimmedCommand, context),
        context,
      )
      const assistantMessage = createMessage(
        'assistant',
        `Planned ${result.actions.length} action${result.actions.length === 1 ? '' : 's'}.`,
      )

      set((state) => ({
        conversationContext: draftActionPlanContext(result),
        isLoading: false,
        messages: [...state.messages, assistantMessage],
        pendingActionPlan: result,
        pendingEnabledToolRoute: null,
        pendingToolTemplateActivation: null,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to plan calendar actions'
      set({ error: message, isLoading: false })
    }
  },
  sendGoal: async (goal) => {
    const trimmedGoal = goal.trim()

    if (!trimmedGoal) return

    if (!aiService?.isAvailable()) {
      set({ error: 'Selected AI provider is not configured.', isAvailable: false })
      return
    }

    const userMessage = createMessage('user', trimmedGoal)
    set({
      conversationContext: null,
      error: null,
      isLoading: true,
      messages: [userMessage],
      pendingActionPlan: null,
      pendingEnabledToolRoute: null,
      pendingToolTemplateActivation: null,
    })

    try {
      const result = await aiService.breakdownGoal(trimmedGoal)
      const assistantMessage = createMessage(
        'assistant',
        `Created ${result.steps.length} schedulable steps.`,
      )

      set((state) => ({
        isLoading: false,
        messages: [...state.messages, assistantMessage],
        pendingSuggestion: result,
        pendingToolTemplateActivation: null,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate schedule'
      set({ error: message, isLoading: false })
    }
  },
}))
