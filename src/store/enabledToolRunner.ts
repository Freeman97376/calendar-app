import { AIProgressToolRequestSchema } from '../domain/schemas/ai.schema'
import type { AICalendarContext, AIProgressToolResult } from '../domain/types'
import type {
  LongTermActionItem,
  LongTermMilestone,
  LongTermToolRun,
} from '../domain/types/longTermMemory'
import type { ActiveTool } from '../domain/logic/enabledTools'
import { buildActiveToolPromptFramework } from '../domain/logic/activeToolPrompt'
import type { IAIService } from '../services/ai/IAIService'
import { goalControlGateway } from './goalControlStore'
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

function planId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

async function stageProgressToolProposal(
  instance: ActiveTool,
  output: AIProgressToolResult,
  userInstruction: string,
) {
  const dashboard = await goalControlGateway.dashboard(instance.projectId)
  const now = new Date().toISOString()
  const milestones = dashboard.milestones.map((item) => ({ ...item }))
  const actions = dashboard.actions.map((item) => ({ ...item }))
  const diff: Array<{
    id: string
    entity: 'milestone' | 'action'
    operation: 'create' | 'update'
    external_id: string
    before: Record<string, unknown> | null
    after: Record<string, unknown>
  }> = []
  const milestoneIdsByTitle = new Map(
    milestones.map((item) => [item.title.trim().toLowerCase(), item.milestone_id]),
  )

  for (const proposed of output.milestones) {
    const existing = milestones.find((item) =>
      proposed.existingMilestoneId
        ? item.milestone_id === proposed.existingMilestoneId
        : titleMatches(item.title, proposed.title),
    )
    const after = existing
      ? {
          ...existing,
          title: proposed.title,
          description: proposed.description ?? existing.description ?? '',
          due_date: proposed.dueDate ?? existing.due_date ?? null,
          status: proposed.status,
          updated_at: now,
        }
      : {
          milestone_id: planId('milestone'),
          project_id: instance.projectId,
          title: proposed.title,
          description: proposed.description ?? '',
          due_date: proposed.dueDate ?? null,
          status: proposed.status,
          metadata: instance.project.metadata,
          created_at: now,
          updated_at: now,
        }
    const index = existing
      ? milestones.findIndex((item) => item.milestone_id === existing.milestone_id)
      : -1
    if (index >= 0) milestones[index] = after
    else milestones.push(after)
    milestoneIdsByTitle.set(after.title.trim().toLowerCase(), after.milestone_id)
    diff.push({
      id: planId('diff'),
      entity: 'milestone',
      operation: existing ? 'update' : 'create',
      external_id: after.milestone_id,
      before: existing ?? null,
      after,
    })
  }

  for (const proposed of output.actions) {
    const existing = actions.find((item) =>
      proposed.existingActionId
        ? item.action_id === proposed.existingActionId
        : titleMatches(item.title, proposed.title),
    )
    const milestoneId = proposed.milestoneTitle
      ? (milestoneIdsByTitle.get(proposed.milestoneTitle.trim().toLowerCase()) ??
        existing?.milestone_id ??
        null)
      : (existing?.milestone_id ?? null)
    const after = existing
      ? {
          ...existing,
          title: proposed.title,
          description: proposed.description ?? existing.description ?? '',
          due_date: proposed.dueDate ?? existing.due_date ?? null,
          energy_needed: proposed.energyNeeded ?? existing.energy_needed ?? 'medium',
          estimated_minutes: proposed.estimatedMinutes ?? existing.estimated_minutes ?? 30,
          milestone_id: milestoneId,
          priority: proposed.priority ?? existing.priority ?? 'medium',
          status: proposed.status,
          updated_at: now,
        }
      : {
          action_id: planId('action'),
          project_id: instance.projectId,
          milestone_id: milestoneId,
          title: proposed.title,
          description: proposed.description ?? '',
          due_date: proposed.dueDate ?? null,
          status: proposed.status,
          estimated_minutes: proposed.estimatedMinutes,
          priority: proposed.priority,
          energy_needed: proposed.energyNeeded,
          execution_tier: 'standard',
          metadata: instance.project.metadata,
          created_at: now,
          updated_at: now,
        }
    const index = existing ? actions.findIndex((item) => item.action_id === existing.action_id) : -1
    if (index >= 0) actions[index] = after
    else actions.push(after)
    diff.push({
      id: planId('diff'),
      entity: 'action',
      operation: existing ? 'update' : 'create',
      external_id: after.action_id,
      before: existing ?? null,
      after,
    })
  }

  if (!diff.length && !output.progressLog) return { handled: true, proposalId: null }
  const latestVersion = dashboard.versions[0]
  const proposal = await goalControlGateway.createProposal({
    project_id: instance.projectId,
    thread_id: dashboard.threads[0]?.thread_id,
    base_version_id: latestVersion?.version_id,
    proposal_type: 'active_tool_ai_change',
    reason: output.summary || userInstruction,
    diff,
    proposal: {
      snapshot: {
        project: dashboard.project,
        milestones,
        actions,
        policy: dashboard.policy,
        metrics: dashboard.metrics,
        dependencies: dashboard.dependencies,
      },
      progressLog: output.progressLog,
      calendarEvents: output.calendarEvents,
    },
  })
  return { handled: true, proposalId: proposal.proposal_id }
}

async function persistProgressToolResult(
  instance: ActiveTool,
  output: AIProgressToolResult,
  userInstruction: string,
) {
  const store = useLongTermMemoryStore.getState()
  const metadata = instance.project.metadata
  const current = useLongTermMemoryStore.getState()
  const milestonesByTitle = new Map<string, LongTermMilestone>()
  let proposalId: string | null = null
  let handledByProposalApi = false

  try {
    const staged = await stageProgressToolProposal(instance, output, userInstruction)
    handledByProposalApi = staged.handled
    proposalId = staged.proposalId
  } catch {
    // Compatibility for old/local API fixtures. Current backends always expose the proposal API.
  }

  for (const milestone of handledByProposalApi ? [] : output.milestones) {
    const existing =
      (milestone.existingMilestoneId
        ? current.milestones.find(
            (candidate) => candidate.milestone_id === milestone.existingMilestoneId,
          )
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

  for (const action of handledByProposalApi ? [] : output.actions) {
    const latestActions = useLongTermMemoryStore.getState().actions
    const existing =
      (action.existingActionId
        ? latestActions.find((candidate) => candidate.action_id === action.existingActionId)
        : undefined) ?? actionByTitle(latestActions, action.title)
    const matchedMilestone = action.milestoneTitle
      ? (milestonesByTitle.get(action.milestoneTitle.trim().toLowerCase()) ??
        milestoneByTitle(latestMilestones, action.milestoneTitle))
      : undefined
    const changes = {
      description: action.description,
      due_date: action.dueDate,
      energy_needed: action.energyNeeded,
      estimated_minutes: action.estimatedMinutes,
      metadata,
      milestone_id: matchedMilestone?.milestone_id,
      priority: action.priority,
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

  if (output.progressLog && !handledByProposalApi) {
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
      proposalId,
      warnings: output.warnings,
    },
    output_summary: output.summary,
    related_goal_id: instance.goalId,
    related_project_id: instance.projectId,
    status:
      proposalId ||
      output.needsUserConfirmation ||
      output.calendarEvents.length ||
      output.warnings.length
        ? 'needs_user_confirmation'
        : 'success',
    tool_name: instance.toolName,
  })
}

async function recordGenericDispatch(instance: ActiveTool, userInstruction: string) {
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
    assistantReply: `${summary} Open Active Tools to continue with this active tool.`,
    calendarEventCount: 0,
    summary,
  }
}

export async function dispatchEnabledToolInstance(
  instance: ActiveTool,
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
    promptFramework: buildActiveToolPromptFramework(instance),
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
      'Task: use this active tool to update its plan, progress, and preview-only calendar drafts.',
    ].join('\n'),
  })
  const output = await service.runProgressTool(request)

  await persistProgressToolResult(instance, output, userInstruction)
  await store.loadProjectDetails(instance.projectId)

  return {
    assistantReply:
      output.assistantReply ??
      `${output.summary}${output.calendarEvents.length ? ' Calendar drafts are waiting in Active Tools.' : ''}`,
    calendarEventCount: output.calendarEvents.length,
    summary: output.summary,
  }
}
