import { AIProgressToolRequestSchema } from '../domain/schemas/ai.schema'
import type {
  AICalendarContext,
  AIProgressToolResult,
} from '../domain/types'
import type {
  LongTermActionItem,
  LongTermMilestone,
  LongTermToolRun,
} from '../domain/types/longTermMemory'
import type { EnabledToolInstance } from '../domain/logic/enabledTools'
import type { IAIService } from '../services/ai/IAIService'
import { useLongTermMemoryStore } from './longTermMemoryStore'

export type EnabledToolDispatchResult = {
  assistantReply: string
  calendarEventCount: number
  summary: string
}

function titleMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function milestoneByTitle(milestones: LongTermMilestone[], title: string) {
  return milestones.find((milestone) => titleMatches(milestone.title, title))
}

function actionByTitle(actions: LongTermActionItem[], title: string) {
  return actions.find((action) => titleMatches(action.title, title))
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

function compactCalendarEvents(context: AICalendarContext) {
  return context.events.slice(0, 20).map((event) => ({
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

async function persistProgressToolResult(
  instance: EnabledToolInstance,
  output: AIProgressToolResult,
  userInstruction: string,
) {
  const store = useLongTermMemoryStore.getState()
  const metadata = instance.project.metadata
  const current = useLongTermMemoryStore.getState()
  const milestonesByTitle = new Map<string, LongTermMilestone>()

  for (const milestone of output.milestones) {
    const existing =
      (milestone.existingMilestoneId
        ? current.milestones.find((candidate) => candidate.milestone_id === milestone.existingMilestoneId)
        : undefined) ?? milestoneByTitle(current.milestones, milestone.title)
    const changes = {
      description: milestone.description,
      due_date: milestone.dueDate,
      metadata,
      project_id: instance.projectId,
      status: milestone.status,
      title: milestone.title,
    }
    const saved = existing
      ? await store.updateMilestone(existing.milestone_id, changes)
      : await store.createMilestone(changes)

    milestonesByTitle.set(milestone.title.trim().toLowerCase(), saved)
  }

  const latestMilestones = useLongTermMemoryStore.getState().milestones

  for (const action of output.actions) {
    const latestActions = useLongTermMemoryStore.getState().actions
    const existing =
      (action.existingActionId
        ? latestActions.find((candidate) => candidate.action_id === action.existingActionId)
        : undefined) ?? actionByTitle(latestActions, action.title)
    const matchedMilestone = action.milestoneTitle
      ? milestonesByTitle.get(action.milestoneTitle.trim().toLowerCase()) ??
        milestoneByTitle(latestMilestones, action.milestoneTitle)
      : undefined
    const changes = {
      description: action.description,
      due_date: action.dueDate,
      metadata,
      milestone_id: matchedMilestone?.milestone_id,
      project_id: instance.projectId,
      status: action.status,
      title: action.title,
    }

    if (existing) {
      await store.updateAction(existing.action_id, changes)
    } else {
      await store.createAction(changes)
    }
  }

  if (output.progressLog) {
    await store.createProgress({
      details: output.progressLog.details,
      goal_id: instance.goalId,
      log_type: output.progressLog.logType,
      metadata,
      project_id: instance.projectId,
      summary: output.progressLog.summary,
    })
  }

  await store.createToolRun({
    input: {
      routedBy: 'ai-assistant',
      sourceToolId: instance.sourceToolId,
      userInstruction,
    },
    input_summary: `AI Assistant routed request to ${instance.instanceAlias}.`,
    intent: `Route to ${instance.instanceAlias}`,
    output: {
      actionCount: output.actions.length,
      calendarEventCount: output.calendarEvents.length,
      calendarEvents: output.calendarEvents,
      confirmedRequirements: output.confirmedRequirements,
      milestoneCount: output.milestones.length,
      warnings: output.warnings,
    },
    output_summary: output.summary,
    related_goal_id: instance.goalId,
    related_project_id: instance.projectId,
    status: output.needsUserConfirmation || output.calendarEvents.length || output.warnings.length
      ? 'needs_user_confirmation'
      : 'success',
    tool_name: instance.toolName,
  })
}

async function recordGenericDispatch(instance: EnabledToolInstance, userInstruction: string) {
  const store = useLongTermMemoryStore.getState()
  const summary = `AI Assistant routed a request to ${instance.instanceAlias}.`
  await store.createProgress({
    details: userInstruction,
    goal_id: instance.goalId,
    log_type: 'tool_result',
    metadata: instance.project.metadata,
    project_id: instance.projectId,
    summary,
  })
  await store.createToolRun({
    input: {
      routedBy: 'ai-assistant',
      sourceToolId: instance.sourceToolId,
      userInstruction,
    },
    input_summary: `AI Assistant routed request to ${instance.instanceAlias}.`,
    intent: `Route to ${instance.instanceAlias}`,
    output: { requiresManualFollowUp: true },
    output_summary: summary,
    related_goal_id: instance.goalId,
    related_project_id: instance.projectId,
    status: 'needs_user_confirmation',
    tool_name: instance.toolName,
  })

  return {
    assistantReply: `${summary} Open Enabled Tools to continue with this instance.`,
    calendarEventCount: 0,
    summary,
  }
}

export async function dispatchEnabledToolInstance(
  instance: EnabledToolInstance,
  userInstruction: string,
  context: AICalendarContext,
  service: IAIService,
): Promise<EnabledToolDispatchResult> {
  const store = useLongTermMemoryStore.getState()
  await store.loadProjectDetails(instance.projectId)

  if (instance.adapterId !== 'ai-progress' || !instance.toolKind) {
    const result = await recordGenericDispatch(instance, userInstruction)
    await store.loadProjectDetails(instance.projectId)
    return result
  }

  const current = useLongTermMemoryStore.getState()
  const memorySearchResults = await store.search(
    [instance.instanceAlias, instance.toolName, userInstruction].filter(Boolean).join(' '),
  )
  const request = AIProgressToolRequestSchema.parse({
    actions: current.actions.slice(0, 25),
    calendarEvents: compactCalendarEvents(context),
    currentDate: context.currentDate,
    currentDateTime: context.currentDateTime,
    currentLocalDateTime: context.currentLocalDateTime,
    focusedDate: context.focusedDate,
    formInput: instance.activationForm,
    locale: context.locale,
    localDateTimeLabel: context.localDateTimeLabel,
    memorySearchResults: memorySearchResults.slice(0, 6),
    milestones: current.milestones.slice(0, 25),
    progress: current.progress.slice(0, 5),
    project: instance.project,
    sourceToolId: instance.sourceToolId,
    timezone: context.timezone,
    timezoneName: context.timezoneName,
    timezoneOffsetLabel: context.timezoneOffsetLabel,
    timezoneOffsetMinutes: context.timezoneOffsetMinutes,
    today: context.today,
    toolKind: instance.toolKind,
    toolRuns: compactToolRuns(current.toolRuns),
    userInstruction: [
      'Latest user message:',
      userInstruction,
      '',
      'Task: use this enabled tool instance to update its plan, progress, and preview-only calendar drafts.',
    ].join('\n'),
  })
  const output = await service.runProgressTool(request)

  await persistProgressToolResult(instance, output, userInstruction)
  await store.loadProjectDetails(instance.projectId)

  return {
    assistantReply:
      output.assistantReply ??
      `${output.summary}${output.calendarEvents.length ? ' Calendar drafts are waiting in Enabled Tools.' : ''}`,
    calendarEventCount: output.calendarEvents.length,
    summary: output.summary,
  }
}
