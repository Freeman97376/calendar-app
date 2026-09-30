import { useEffect, useMemo, useState } from 'react'

import {
  activeToolsFromProjects,
  createActiveToolMetadata,
  enabledToolProgress,
  type ActiveTool,
} from '../domain/logic/enabledTools'
import type { EventDraft } from '../domain/logic/eventUtils'
import {
  buildToolRoadmap,
  implementationPathFromText,
  implementationPathToText,
} from '../domain/logic/toolRoadmap'
import { buildActiveToolPromptFramework } from '../domain/logic/activeToolPrompt'
import type {
  ActionItemStatus,
  LongTermToolRun,
  MilestoneStatus,
  ProjectStatus,
} from '../domain/types/longTermMemory'
import type { GoalControlDashboard } from '../domain/types/goalControl'
import { calendarActionBatchGateway } from '../store/calendarActionBatchStore'
import { useEventStore } from '../store/eventStore'
import { goalControlGateway } from '../store/goalControlStore'
import { requestScheduleRecompute, useSchedulingStore } from '../store/schedulingStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { useEnabledToolsPanel } from './useEnabledToolsPanel'

type EnabledToolCalendarDraft = EventDraft & {
  allDay: boolean
  endAt: string
  startAt: string
  title: string
}

export type ActiveToolPlanEditorValue = {
  actions: Array<{
    actionId: string
    dependsOn: string[]
    title: string
    dueDate: string | null
    estimatedMinutes: number
    executionTier: 'minimum' | 'standard' | 'stretch'
    priority: 'high' | 'medium' | 'low'
  }>
  activationSummary: string
  availableDays: string[]
  bufferPercent: number
  implementationPathText: string
  longTermGoalLabel: string
  routeTags: string[]
  targetDate: string | null
  toolFeatures: string[]
  weeklyCapacityMinutes: number
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function canonicalAvailableDays(values: string[]): string[] {
  const aliases: Record<string, string> = {
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    sunday: 'sun',
    周一: 'mon',
    周二: 'tue',
    周三: 'wed',
    周四: 'thu',
    周五: 'fri',
    周六: 'sat',
    周日: 'sun',
  }
  return [
    ...new Set(
      values.map((value) => aliases[value.toLowerCase()] ?? value.toLowerCase().slice(0, 3)),
    ),
  ].filter((value) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(value))
}

function calendarDraftFromUnknown(value: unknown): EnabledToolCalendarDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const title = optionalString(record.title)
  const startAt = optionalString(record.startAt)
  const endAt = optionalString(record.endAt)

  if (!title || !startAt || !endAt) return null

  return {
    allDay: typeof record.allDay === 'boolean' ? record.allDay : false,
    color: optionalString(record.color),
    description: optionalString(record.description),
    displayDetails: optionalString(record.displayDetails),
    endAt,
    eventTypeId: optionalString(record.eventTypeId),
    startAt,
    title,
  }
}

export function latestCalendarDrafts(toolRuns: LongTermToolRun[]) {
  const run = toolRuns.find(
    (entry) =>
      entry.output &&
      Array.isArray((entry.output as { calendarEvents?: unknown }).calendarEvents) &&
      ((entry.output as { calendarEvents?: unknown[] }).calendarEvents?.length ?? 0) > 0,
  )
  const drafts = (run?.output as { calendarEvents?: unknown[] } | undefined)?.calendarEvents ?? []

  return drafts
    .map(calendarDraftFromUnknown)
    .filter((draft): draft is EnabledToolCalendarDraft => Boolean(draft))
}

export function latestCalendarDraftReview(toolRuns: LongTermToolRun[]) {
  const run = toolRuns.find(
    (entry) =>
      entry.output &&
      Array.isArray((entry.output as { calendarEvents?: unknown }).calendarEvents) &&
      ((entry.output as { calendarEvents?: unknown[] }).calendarEvents?.length ?? 0) > 0,
  )
  return { drafts: latestCalendarDrafts(run ? [run] : []), toolRunId: run?.tool_run_id ?? '' }
}

export type ActiveToolCalendarApproval = {
  drafts: EnabledToolCalendarDraft[]
  idempotencyKey: string
  projectId: string
  toolName: string
  toolRunId: string
}

export function useEnabledTools() {
  const panel = useEnabledToolsPanel()
  const actions = useLongTermMemoryStore((state) => state.actions)
  const createProgress = useLongTermMemoryStore((state) => state.createProgress)
  const reconcileEvents = useEventStore((state) => state.reconcileBatch)
  const error = useLongTermMemoryStore((state) => state.error)
  const goals = useLongTermMemoryStore((state) => state.goals)
  const isDetailLoading = useLongTermMemoryStore((state) => state.isDetailLoading)
  const isLoading = useLongTermMemoryStore((state) => state.isLoading)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const loadProjectDetails = useLongTermMemoryStore((state) => state.loadProjectDetails)
  const loadedProjectId = useLongTermMemoryStore((state) => state.loadedProjectId)
  const milestones = useLongTermMemoryStore((state) => state.milestones)
  const progress = useLongTermMemoryStore((state) => state.progress)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const toolRuns = useLongTermMemoryStore((state) => state.toolRuns)
  const updateActionStatus = useLongTermMemoryStore((state) => state.updateActionStatus)
  const updateMilestoneStatus = useLongTermMemoryStore((state) => state.updateMilestoneStatus)
  const updateProject = useLongTermMemoryStore((state) => state.updateProject)
  const schedulingError = useSchedulingStore((state) => state.error)
  const pendingToolEdit = useSchedulingStore((state) =>
    Boolean(
      state.proposal &&
      ['pending', 'blocked'].includes(state.proposal.status) &&
      state.proposal.proposal.planChange,
    ),
  )
  const recomputeSchedule = useSchedulingStore((state) => state.recompute)
  const instances = useMemo(() => activeToolsFromProjects(projects, goals), [goals, projects])
  const activeInstance =
    instances.find((instance) => instance.projectId === panel.activeProjectId) ??
    instances[0] ??
    null
  const [editorDashboard, setEditorDashboard] = useState<GoalControlDashboard | null>(null)
  const progressSummary = enabledToolProgress(actions, milestones)
  const roadmap = activeInstance
    ? buildToolRoadmap(
        activeInstance.goal,
        activeInstance.project,
        milestones,
        actions,
        progress,
        toolRuns,
      )
    : null
  const planEditorValue: ActiveToolPlanEditorValue | null =
    activeInstance && roadmap && editorDashboard?.project.project_id === activeInstance.projectId
      ? {
          actions: editorDashboard.actions.map((action) => ({
            actionId: action.action_id,
            dependsOn: editorDashboard.dependencies
              .filter((dependency) => dependency.successor_action_id === action.action_id)
              .map((dependency) => dependency.predecessor_action_id),
            title: action.title,
            dueDate: action.due_date ?? null,
            estimatedMinutes: Number(action.estimated_minutes || 30),
            executionTier: action.execution_tier,
            priority: action.priority,
          })),
          activationSummary: activeInstance.activationSummary || activeInstance.project.description,
          availableDays: canonicalAvailableDays(editorDashboard.policy.available_days),
          bufferPercent: Number(editorDashboard.policy.buffer_percent),
          implementationPathText: implementationPathToText(
            activeInstance.implementationPath.length
              ? activeInstance.implementationPath
              : roadmap.steps,
          ),
          longTermGoalLabel:
            activeInstance.longTermGoalLabel ??
            activeInstance.goal?.title ??
            activeInstance.project.title,
          routeTags: activeInstance.routeTags,
          targetDate: optionalString(activeInstance.project.metadata.targetDate) ?? null,
          toolFeatures: activeInstance.toolFeatures.length
            ? activeInstance.toolFeatures
            : activeInstance.routeTags,
          weeklyCapacityMinutes: Number(editorDashboard.policy.weekly_capacity_minutes),
        }
      : null
  const promptFramework = activeInstance ? buildActiveToolPromptFramework(activeInstance) : ''
  const calendarDraftReview =
    activeInstance && loadedProjectId === activeInstance.projectId && !isDetailLoading
      ? latestCalendarDraftReview(toolRuns)
      : { drafts: [], toolRunId: '' }
  const calendarDrafts = calendarDraftReview.drafts
  const [applyStatus, setApplyStatus] = useState<string | null>(null)
  const [isApplyingCalendarDrafts, setIsApplyingCalendarDrafts] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function recordManualVersion(projectId: string, summary: string) {
    await goalControlGateway
      .createVersion(projectId, { source: 'manual', summary })
      .catch(() => undefined)
  }

  useEffect(() => {
    loadOverview().catch(() => undefined)
  }, [loadOverview])

  useEffect(() => {
    if (!panel.activeProjectId && activeInstance) {
      panel.setActiveProjectId(activeInstance.projectId)
    }
  }, [activeInstance, panel])

  useEffect(() => {
    if (!activeInstance) {
      setEditorDashboard(null)
      return
    }
    let cancelled = false
    loadProjectDetails(activeInstance.projectId).catch(() => undefined)
    goalControlGateway
      .dashboard(activeInstance.projectId)
      .then((value) => {
        if (!cancelled) setEditorDashboard(value)
      })
      .catch(() => {
        if (!cancelled) setEditorDashboard(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeInstance, loadProjectDetails])

  async function toggleRouting(instance: ActiveTool) {
    const metadata = createActiveToolMetadata({
      activationForm: instance.activationForm,
      activationSummary: instance.activationSummary,
      adapterId: instance.adapterId,
      implementationPath: instance.implementationPath,
      instanceAlias: instance.instanceAlias,
      longTermGoalLabel: instance.longTermGoalLabel,
      parentTemplateId: instance.parentTemplateId,
      parentTemplateLabel: instance.parentTemplateLabel,
      parentTemplateToolName: instance.parentTemplateToolName,
      roadmapFormatVersion: instance.roadmapFormatVersion,
      routeTags: instance.routeTags,
      routingEnabled: !instance.routingEnabled,
      sourceToolId: instance.sourceToolId,
      templateId: instance.templateId,
      toolFeatures: instance.toolFeatures,
      toolKind: instance.toolKind,
      toolName: instance.toolName,
    })
    await updateProject(instance.projectId, { metadata })
  }

  async function renameActiveTool(instance: ActiveTool, alias: string) {
    const instanceAlias = alias.trim()
    if (!instanceAlias || instanceAlias === instance.instanceAlias) return

    const metadata = createActiveToolMetadata({
      activationForm: instance.activationForm,
      activationSummary: instance.activationSummary,
      adapterId: instance.adapterId,
      implementationPath: instance.implementationPath,
      instanceAlias,
      longTermGoalLabel: instance.longTermGoalLabel,
      parentTemplateId: instance.parentTemplateId,
      parentTemplateLabel: instance.parentTemplateLabel,
      parentTemplateToolName: instance.parentTemplateToolName,
      roadmapFormatVersion: instance.roadmapFormatVersion,
      routeTags: instance.routeTags,
      routingEnabled: instance.routingEnabled,
      sourceToolId: instance.sourceToolId,
      templateId: instance.templateId,
      toolFeatures: instance.toolFeatures,
      toolKind: instance.toolKind,
      toolName: instance.toolName,
    })

    const dashboard = await goalControlGateway.dashboard(instance.projectId)
    await recomputeSchedule('active_tool_rename', {
      projectId: instance.projectId,
      baseVersionId: dashboard.versions?.[0]?.version_id,
      changes: { metadata, title: instanceAlias },
    })
    setApplyStatus('已生成工具重命名及全局重排影响提案，确认前不会修改工具或日历。')
  }

  async function updateActiveToolPlan(instance: ActiveTool, changes: ActiveToolPlanEditorValue) {
    const metadata = {
      ...instance.project.metadata,
      ...createActiveToolMetadata({
        activationForm: instance.activationForm,
        activationSummary: changes.activationSummary.trim(),
        adapterId: instance.adapterId,
        implementationPath: implementationPathFromText(changes.implementationPathText),
        instanceAlias: instance.instanceAlias,
        longTermGoalLabel: changes.longTermGoalLabel.trim(),
        parentTemplateId: instance.parentTemplateId,
        parentTemplateLabel: instance.parentTemplateLabel,
        parentTemplateToolName: instance.parentTemplateToolName,
        roadmapFormatVersion: instance.roadmapFormatVersion,
        routeTags: changes.routeTags,
        routingEnabled: instance.routingEnabled,
        sourceToolId: instance.sourceToolId,
        templateId: instance.templateId,
        toolFeatures: changes.toolFeatures,
        toolKind: instance.toolKind,
        toolName: instance.toolName,
      }),
      targetDate: changes.targetDate,
    }

    const dashboard = await goalControlGateway.dashboard(instance.projectId)
    await recomputeSchedule('active_tool_plan_edit', {
      projectId: instance.projectId,
      baseVersionId: dashboard.versions?.[0]?.version_id,
      changes: {
        metadata,
        policy: {
          weeklyCapacityMinutes: changes.weeklyCapacityMinutes,
          bufferPercent: changes.bufferPercent,
          availableDays: changes.availableDays,
        },
        actions: changes.actions.map((action) => ({
          actionId: action.actionId,
          title: action.title,
          dueDate: action.dueDate,
          estimatedMinutes: action.estimatedMinutes,
          executionTier: action.executionTier,
          priority: action.priority,
        })),
        dependencies: changes.actions.flatMap((action) =>
          action.dependsOn.map((predecessorActionId) => ({
            predecessorActionId,
            successorActionId: action.actionId,
          })),
        ),
      },
    })
    setApplyStatus('已生成“计划变更＋全局重排影响”提案，确认前不会修改工具或日历。')
  }

  async function setActionStatus(actionId: string, title: string, status: ActionItemStatus) {
    if (!activeInstance) return
    await updateActionStatus(actionId, status)
    await createProgress({
      action_id: actionId,
      details: `Set action "${title}" to ${status}.`,
      goal_id: activeInstance.goalId,
      log_type: status === 'blocked' ? 'blocker' : 'update',
      metadata: activeInstance.project.metadata,
      project_id: activeInstance.projectId,
      summary: `${title}: ${status.replace(/_/g, ' ')}`,
    })
    await recordManualVersion(activeInstance.projectId, `Updated action status: ${title}.`)
    await loadProjectDetails(activeInstance.projectId)
    requestScheduleRecompute('active_tool_action_changed')
  }

  async function setMilestoneStatus(milestoneId: string, title: string, status: MilestoneStatus) {
    if (!activeInstance) return
    await updateMilestoneStatus(milestoneId, status)
    await createProgress({
      details: `Set milestone "${title}" to ${status}.`,
      goal_id: activeInstance.goalId,
      log_type: status === 'blocked' ? 'blocker' : 'update',
      metadata: activeInstance.project.metadata,
      project_id: activeInstance.projectId,
      summary: `${title}: ${status.replace(/_/g, ' ')}`,
    })
    await recordManualVersion(activeInstance.projectId, `Updated milestone status: ${title}.`)
    await loadProjectDetails(activeInstance.projectId)
    requestScheduleRecompute('active_tool_milestone_changed')
  }

  async function applyCalendarDrafts(approval?: ActiveToolCalendarApproval) {
    const review =
      approval ??
      (activeInstance
        ? {
            drafts: calendarDrafts,
            idempotencyKey: `active-tool-${Date.now()}`,
            projectId: activeInstance.projectId,
            toolName: activeInstance.toolName,
            toolRunId: calendarDraftReview.toolRunId,
          }
        : null)
    if (!review?.drafts.length || !review.projectId || !review.toolRunId) return []

    setApplyStatus(null)
    setLocalError(null)
    setIsApplyingCalendarDrafts(true)

    try {
      const result = await calendarActionBatchGateway.apply({
        actions: review.drafts.map((draft, index) => ({
          clientActionId: `tool-${index + 1}`,
          event: draft,
          skipIfDuplicate: true,
          type: 'create_event' as const,
        })),
        idempotencyKey: review.idempotencyKey,
        projectId: review.projectId,
        source: 'active-tool-calendar-drafts',
        toolRunId: review.toolRunId,
      })
      reconcileEvents(result.eventsUpserted, result.deletedEventIds)
      requestScheduleRecompute('calendar_batch_applied')
      const appliedCount = result.results.filter((entry) => entry.status === 'applied').length
      const skippedDuplicateCount = result.results.filter(
        (entry) => entry.status === 'skipped_duplicate',
      ).length
      setApplyStatus(
        `Applied ${appliedCount} calendar event${appliedCount === 1 ? '' : 's'}.${
          skippedDuplicateCount
            ? ` Skipped ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? '' : 's'}.`
            : ''
        }`,
      )

      return result.eventsUpserted
    } catch (applyError) {
      const message =
        applyError instanceof Error ? applyError.message : 'Unable to apply calendar drafts'
      setLocalError(message)
      throw applyError
    } finally {
      setIsApplyingCalendarDrafts(false)
    }
  }

  return {
    actions,
    activeInstance,
    applyCalendarDrafts,
    applyStatus,
    calendarDrafts,
    calendarDraftToolRunId: calendarDraftReview.toolRunId,
    close: panel.close,
    error: localError ?? schedulingError ?? error,
    pendingToolEdit,
    instances,
    isApplyingCalendarDrafts,
    isDetailLoading,
    isLoading,
    milestones,
    progress,
    progressSummary,
    planEditorValue,
    promptFramework,
    roadmap,
    renameActiveTool,
    setActionStatus,
    setActiveProjectId: panel.setActiveProjectId,
    setMilestoneStatus,
    toolRuns,
    toggleRouting,
    updateActiveToolPlan,
    updateProjectStatus: async (projectId: string, status: ProjectStatus) => {
      const dashboard = await goalControlGateway.dashboard(projectId)
      await recomputeSchedule('active_tool_status_changed', {
        projectId,
        baseVersionId: dashboard.versions?.[0]?.version_id,
        changes: { status },
      })
      setApplyStatus('已生成工具状态及全局重排影响提案，确认前不会修改工具或日历。')
    },
  }
}
