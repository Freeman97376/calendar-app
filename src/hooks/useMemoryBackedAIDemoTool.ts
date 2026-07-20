import { useEffect, useMemo, useState } from 'react'

import { calculateProjectProgress } from '../domain/logic/progress'
import { splitUniqueEventDrafts } from '../domain/logic/eventDeduplication'
import { getLocalTimeContext } from '../domain/logic/timeContext'
import { AIProgressToolRequestSchema } from '../domain/schemas/ai.schema'
import type { AIProgressToolKind, AIProgressToolResult, Event } from '../domain/types'
import type {
  ActionItemStatus,
  LongTermActionItem,
  LongTermMilestone,
  LongTermToolRun,
  MilestoneStatus,
} from '../domain/types/longTermMemory'
import { getConfiguredAIService } from '../store/aiStore'
import { useConfigStore } from '../store/configStore'
import { useEventStore } from '../store/eventStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'

type UseMemoryBackedAIDemoToolOptions = {
  defaultProjectDescription: string
  defaultProjectTitle: string
  sourceToolId: string
  toolKind: AIProgressToolKind
  toolName: string
}

type ToolMetadata = {
  linkedTodoId?: string
  sourceToolId: string
  toolCategory: 'ai-demo'
  toolKind: AIProgressToolKind | 'todo-long-project'
}

export type AIDemoConversationMessage = {
  content: string
  id: string
  role: 'assistant' | 'user'
}

function toolMetadata(
  toolKind: ToolMetadata['toolKind'],
  sourceToolId: string,
  linkedTodoId?: string,
): ToolMetadata {
  return {
    linkedTodoId,
    sourceToolId,
    toolCategory: 'ai-demo',
    toolKind,
  }
}

function metadataMatches(
  metadata: Record<string, unknown>,
  toolKind: AIProgressToolKind,
  sourceToolId: string,
): boolean {
  return (
    metadata.toolCategory === 'ai-demo' &&
    metadata.toolKind === toolKind &&
    metadata.sourceToolId === sourceToolId
  )
}

function titleMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function localDateOffset(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(year, month - 1, day)
  next.setDate(next.getDate() + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(
    next.getDate(),
  ).padStart(2, '0')}`
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value
}

function createConversationMessage(
  role: AIDemoConversationMessage['role'],
  content: string,
): AIDemoConversationMessage {
  return {
    content,
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
  }
}

function compactConversationInstruction(messages: AIDemoConversationMessage[]): string {
  const latest = messages[messages.length - 1]
  const recent = messages.slice(-6)
  return truncateText(
    [
      'Latest user message:',
      latest?.content ?? '',
      '',
      'Recent tool conversation:',
      ...recent.map((message) => `${message.role}: ${truncateText(message.content, 220)}`),
      '',
      'Task: confirm requirements through the conversation, update the current plan, and keep progress tracking current.',
    ].join('\n'),
    1000,
  )
}

function eventInCompactWindow(event: Event, today: string): boolean {
  const start = new Date(event.startAt)
  if (Number.isNaN(start.getTime())) return false

  const windowStart = new Date(`${localDateOffset(today, -7)}T00:00:00`)
  const windowEnd = new Date(`${localDateOffset(today, 21)}T23:59:59`)

  return start >= windowStart && start <= windowEnd
}

function compactEvents(events: Event[], today: string) {
  return events
    .filter((event) => eventInCompactWindow(event, today))
    .slice(0, 20)
    .map((event) => ({
      allDay: event.allDay,
      description: event.description,
      displayDetails: event.displayDetails,
      endAt: event.endAt,
      eventTypeId: event.eventTypeId,
      id: event.id,
      startAt: event.startAt,
      title: event.title,
    }))
}

function compactToolRuns(toolRuns: LongTermToolRun[]) {
  return toolRuns.slice(0, 5).map((toolRun) => ({
    created_at: toolRun.created_at,
    intent: toolRun.intent,
    output_summary: toolRun.output_summary,
    status: toolRun.status,
    tool_name: toolRun.tool_name,
    tool_run_id: toolRun.tool_run_id,
  }))
}

function milestoneByTitle(
  milestones: LongTermMilestone[],
  title: string,
): LongTermMilestone | undefined {
  return milestones.find((milestone) => titleMatches(milestone.title, title))
}

function actionByTitle(
  actions: LongTermActionItem[],
  title: string,
): LongTermActionItem | undefined {
  return actions.find((action) => titleMatches(action.title, title))
}

export function useMemoryBackedAIDemoTool(options: UseMemoryBackedAIDemoToolOptions) {
  const config = useConfigStore((state) => state.config)
  const events = useEventStore((state) => state.events)
  const createEvent = useEventStore((state) => state.createEvent)
  const actions = useLongTermMemoryStore((state) => state.actions)
  const createAction = useLongTermMemoryStore((state) => state.createAction)
  const createGoal = useLongTermMemoryStore((state) => state.createGoal)
  const createMilestone = useLongTermMemoryStore((state) => state.createMilestone)
  const createProgress = useLongTermMemoryStore((state) => state.createProgress)
  const createProject = useLongTermMemoryStore((state) => state.createProject)
  const createToolRun = useLongTermMemoryStore((state) => state.createToolRun)
  const error = useLongTermMemoryStore((state) => state.error)
  const goals = useLongTermMemoryStore((state) => state.goals)
  const isDetailLoading = useLongTermMemoryStore((state) => state.isDetailLoading)
  const isLoading = useLongTermMemoryStore((state) => state.isLoading)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const loadProjectDetails = useLongTermMemoryStore((state) => state.loadProjectDetails)
  const milestones = useLongTermMemoryStore((state) => state.milestones)
  const progress = useLongTermMemoryStore((state) => state.progress)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const searchMemory = useLongTermMemoryStore((state) => state.search)
  const toolRuns = useLongTermMemoryStore((state) => state.toolRuns)
  const updateAction = useLongTermMemoryStore((state) => state.updateAction)
  const updateActionStatus = useLongTermMemoryStore((state) => state.updateActionStatus)
  const updateMilestone = useLongTermMemoryStore((state) => state.updateMilestone)
  const updateMilestoneStatus = useLongTermMemoryStore((state) => state.updateMilestoneStatus)
  const [conversation, setConversation] = useState<AIDemoConversationMessage[]>([])
  const [isApplyingEvents, setIsApplyingEvents] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [result, setResult] = useState<AIProgressToolResult | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const toolProjects = useMemo(
    () =>
      projects.filter((project) =>
        metadataMatches(project.metadata, options.toolKind, options.sourceToolId),
      ),
    [options.sourceToolId, options.toolKind, projects],
  )
  const selectedProject =
    toolProjects.find((project) => project.project_id === selectedProjectId) ?? null
  const selectedGoal = selectedProject
    ? (goals.find((goal) => goal.goal_id === selectedProject.goal_id) ?? null)
    : null
  const progressSummary = useMemo(
    () => calculateProjectProgress(actions, milestones),
    [actions, milestones],
  )

  useEffect(() => {
    loadOverview().catch(() => undefined)
  }, [loadOverview])

  useEffect(() => {
    setLocalError(null)
    setResult(null)
    setSelectedProjectId('')
  }, [options.sourceToolId, options.toolKind])

  useEffect(() => {
    if (
      selectedProjectId &&
      toolProjects.some((project) => project.project_id === selectedProjectId)
    )
      return
    setSelectedProjectId(toolProjects[0]?.project_id ?? '')
  }, [selectedProjectId, toolProjects])

  useEffect(() => {
    loadProjectDetails(selectedProjectId).catch(() => undefined)
  }, [loadProjectDetails, selectedProjectId])

  async function ensureProject(title?: string, description?: string) {
    if (selectedProject) return selectedProject

    const metadata = toolMetadata(options.toolKind, options.sourceToolId)
    const goal = await createGoal({
      description: description || options.defaultProjectDescription,
      metadata,
      title: title || options.defaultProjectTitle,
    })
    const project = await createProject({
      description: description || options.defaultProjectDescription,
      goal_id: goal.goal_id,
      metadata,
      title: title || options.defaultProjectTitle,
    })
    setSelectedProjectId(project.project_id)
    await loadProjectDetails(project.project_id)
    return project
  }

  async function persistResult(
    projectId: string,
    goalId: string,
    output: AIProgressToolResult,
    userInstruction?: string,
  ) {
    const nextMilestones: LongTermMilestone[] = []
    const milestonesByTitle = new Map<string, LongTermMilestone>()
    const baseMetadata = toolMetadata(options.toolKind, options.sourceToolId)

    for (const milestone of output.milestones) {
      const existing =
        (milestone.existingMilestoneId
          ? milestones.find((candidate) => candidate.milestone_id === milestone.existingMilestoneId)
          : undefined) ?? milestoneByTitle(milestones, milestone.title)
      const changes = {
        description: milestone.description,
        due_date: milestone.dueDate,
        metadata: baseMetadata,
        project_id: projectId,
        status: milestone.status,
        title: milestone.title,
      }
      const saved = existing
        ? await updateMilestone(existing.milestone_id, changes)
        : await createMilestone(changes)

      const finalMilestone = saved
      nextMilestones.push(finalMilestone)
      milestonesByTitle.set(milestone.title.trim().toLowerCase(), finalMilestone)
    }

    for (const action of output.actions) {
      const existing =
        (action.existingActionId
          ? actions.find((candidate) => candidate.action_id === action.existingActionId)
          : undefined) ?? actionByTitle(actions, action.title)
      const matchedMilestone = action.milestoneTitle
        ? (milestonesByTitle.get(action.milestoneTitle.trim().toLowerCase()) ??
          milestoneByTitle(milestones, action.milestoneTitle))
        : undefined
      const changes = {
        description: action.description,
        due_date: action.dueDate,
        metadata: baseMetadata,
        milestone_id: matchedMilestone?.milestone_id,
        project_id: projectId,
        status: action.status,
        title: action.title,
      }

      if (existing) {
        await updateAction(existing.action_id, changes)
      } else {
        await createAction(changes)
      }
    }

    if (output.progressLog) {
      await createProgress({
        details: output.progressLog.details,
        goal_id: goalId,
        log_type: output.progressLog.logType,
        metadata: baseMetadata,
        project_id: projectId,
        summary: output.progressLog.summary,
      })
    }

    await createToolRun({
      input: {
        needsUserConfirmation: output.needsUserConfirmation,
        toolKind: options.toolKind,
        userInstruction: userInstruction ? truncateText(userInstruction, 400) : undefined,
      },
      input_summary: userInstruction
        ? `${options.toolName} conversation update for ${selectedProject?.title ?? options.defaultProjectTitle}`
        : `${options.toolName} generated progress for ${selectedProject?.title ?? options.defaultProjectTitle}`,
      intent: userInstruction
        ? `Conversation update in ${options.toolName}`
        : `Run ${options.toolName}`,
      output: {
        actionCount: output.actions.length,
        calendarEventCount: output.calendarEvents.length,
        confirmedRequirements: output.confirmedRequirements,
        milestoneCount: output.milestones.length,
        warnings: output.warnings,
      },
      output_summary: output.summary,
      related_goal_id: goalId,
      related_project_id: projectId,
      status:
        output.needsUserConfirmation || output.warnings.length
          ? 'needs_user_confirmation'
          : 'success',
      tool_name: options.toolName,
    })
    await loadProjectDetails(projectId)
  }

  async function run(formInput: Record<string, string>, userInstruction?: string) {
    const service = getConfiguredAIService()

    if (!service?.isAvailable()) {
      setLocalError('Selected AI provider is not configured.')
      return null
    }

    const project = await ensureProject(formInput.goal || formInput.outcome, userInstruction)
    const timeContext = getLocalTimeContext(new Date(), config.timezoneOverride)

    setIsRunning(true)
    setLocalError(null)
    try {
      const memorySearchResults = await searchMemory(
        [formInput.goal, formInput.outcome, project.title, options.toolName]
          .filter(Boolean)
          .join(' '),
      )
      const request = AIProgressToolRequestSchema.parse({
        ...timeContext,
        actions: actions.slice(0, 25),
        calendarEvents: compactEvents(events, timeContext.currentDate),
        focusedDate: timeContext.currentDate,
        formInput,
        memorySearchResults: memorySearchResults.slice(0, 6),
        milestones: milestones.slice(0, 25),
        progress: progress.slice(0, 5),
        project,
        sourceToolId: options.sourceToolId,
        today: timeContext.currentDate,
        toolKind: options.toolKind,
        toolRuns: compactToolRuns(toolRuns),
        userInstruction,
      })
      const output = await service.runProgressTool(request)

      await persistResult(project.project_id, project.goal_id, output, userInstruction)
      setResult(output)
      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to run ${options.toolName}`
      setLocalError(message)
      throw error
    } finally {
      setIsRunning(false)
    }
  }

  async function sendConversationMessage(formInput: Record<string, string>, content: string) {
    const trimmed = content.trim()
    if (!trimmed) return null

    const userMessage = createConversationMessage('user', trimmed)
    const nextConversation = [...conversation, userMessage]
    const userInstruction = compactConversationInstruction(nextConversation)
    setConversation(nextConversation)

    try {
      const output = await run(formInput, userInstruction)
      const assistantText =
        output?.assistantReply ?? output?.currentRecommendation ?? output?.summary
      if (assistantText) {
        setConversation((current) => [
          ...current,
          createConversationMessage('assistant', assistantText),
        ])
      }
      return output
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to update ${options.toolName}`
      setConversation((current) => [...current, createConversationMessage('assistant', message)])
      throw error
    }
  }

  async function applyCalendarEvents() {
    if (!result || !selectedProject) return { created: [], skippedDuplicateCount: 0 }

    setIsApplyingEvents(true)
    setLocalError(null)
    try {
      const { duplicateDrafts, uniqueDrafts } = splitUniqueEventDrafts(
        result.calendarEvents,
        events,
      )
      const created = []
      for (const event of uniqueDrafts) {
        created.push(await createEvent(event))
      }
      await createToolRun({
        input: {
          eventCount: result.calendarEvents.length,
          skippedDuplicateCount: duplicateDrafts.length,
          toolKind: options.toolKind,
        },
        input_summary: `Apply ${result.calendarEvents.length} ${options.toolName} calendar event(s).`,
        intent: `Apply ${options.toolName} calendar preview`,
        output: {
          createdEventIds: created.map((event) => event.id),
          skippedDuplicateCount: duplicateDrafts.length,
          skippedDuplicates: duplicateDrafts.map((duplicate) => ({
            existingEventId: duplicate.existingEventId,
            reason: duplicate.reason,
            title: duplicate.draft.title,
          })),
        },
        output_summary: `Applied ${created.length} calendar event(s).${
          duplicateDrafts.length ? ` Skipped ${duplicateDrafts.length} duplicate event(s).` : ''
        }`,
        related_goal_id: selectedProject.goal_id,
        related_project_id: selectedProject.project_id,
        status: 'success',
        tool_name: options.toolName,
      })
      await loadProjectDetails(selectedProject.project_id)
      return {
        created,
        skippedDuplicateCount: duplicateDrafts.length,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply calendar events'
      setLocalError(message)
      throw error
    } finally {
      setIsApplyingEvents(false)
    }
  }

  async function setActionStatus(action: LongTermActionItem, status: ActionItemStatus) {
    const updated = await updateActionStatus(action.action_id, status)
    if (selectedProject) {
      await createProgress({
        action_id: action.action_id,
        details: `Set action "${action.title}" to ${status}.`,
        goal_id: selectedProject.goal_id,
        log_type: status === 'blocked' ? 'blocker' : 'update',
        metadata: toolMetadata(options.toolKind, options.sourceToolId),
        project_id: selectedProject.project_id,
        summary: `${action.title}: ${status.replace(/_/g, ' ')}`,
      })
    }
    return updated
  }

  async function setMilestoneStatus(milestone: LongTermMilestone, status: MilestoneStatus) {
    const updated = await updateMilestoneStatus(milestone.milestone_id, status)
    if (selectedProject) {
      await createProgress({
        details: `Set milestone "${milestone.title}" to ${status}.`,
        goal_id: selectedProject.goal_id,
        log_type: status === 'blocked' ? 'blocker' : 'update',
        metadata: toolMetadata(options.toolKind, options.sourceToolId),
        project_id: selectedProject.project_id,
        summary: `${milestone.title}: ${status.replace(/_/g, ' ')}`,
      })
    }
    return updated
  }

  return {
    actions,
    applyCalendarEvents,
    clearResult: () => setResult(null),
    conversation,
    createProject: ensureProject,
    error: localError ?? error,
    isApplyingEvents,
    isDetailLoading,
    isLoading,
    isRunning,
    milestones,
    progress,
    progressSummary,
    projects: toolProjects,
    result,
    run,
    sendConversationMessage,
    selectedGoal,
    selectedProject,
    selectedProjectId,
    setActionStatus,
    setMilestoneStatus,
    setSelectedProjectId,
    toolRuns,
  }
}

export { toolMetadata }
