import { useEffect, useMemo, useState } from 'react'

import {
  createEnabledToolMetadata,
  enabledToolInstancesFromProjects,
  enabledToolProgress,
  type EnabledToolInstance,
} from '../domain/logic/enabledTools'
import { splitUniqueEventDrafts } from '../domain/logic/eventDeduplication'
import type { EventDraft } from '../domain/logic/eventUtils'
import type {
  ActionItemStatus,
  LongTermToolRun,
  MilestoneStatus,
  ProjectStatus,
} from '../domain/types/longTermMemory'
import { useEventStore } from '../store/eventStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { useUIStore } from '../store/uiStore'
import { useEnabledToolsPanel } from './useEnabledToolsPanel'

type EnabledToolCalendarDraft = EventDraft & {
  endAt: string
  startAt: string
  title: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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

export function useEnabledTools() {
  const panel = useEnabledToolsPanel()
  const actions = useLongTermMemoryStore((state) => state.actions)
  const createProgress = useLongTermMemoryStore((state) => state.createProgress)
  const createToolRun = useLongTermMemoryStore((state) => state.createToolRun)
  const createEvent = useEventStore((state) => state.createEvent)
  const events = useEventStore((state) => state.events)
  const error = useLongTermMemoryStore((state) => state.error)
  const goals = useLongTermMemoryStore((state) => state.goals)
  const isDetailLoading = useLongTermMemoryStore((state) => state.isDetailLoading)
  const isLoading = useLongTermMemoryStore((state) => state.isLoading)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const loadProjectDetails = useLongTermMemoryStore((state) => state.loadProjectDetails)
  const milestones = useLongTermMemoryStore((state) => state.milestones)
  const progress = useLongTermMemoryStore((state) => state.progress)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const toolRuns = useLongTermMemoryStore((state) => state.toolRuns)
  const updateActionStatus = useLongTermMemoryStore((state) => state.updateActionStatus)
  const updateMilestoneStatus = useLongTermMemoryStore((state) => state.updateMilestoneStatus)
  const updateProject = useLongTermMemoryStore((state) => state.updateProject)
  const updateProjectStatus = useLongTermMemoryStore((state) => state.updateProjectStatus)
  const activeWorkspacePanel = useUIStore((state) => state.activeWorkspacePanel)
  const showWorkspaceCalendar = useUIStore((state) => state.showWorkspaceCalendar)
  const instances = useMemo(
    () => enabledToolInstancesFromProjects(projects, goals),
    [goals, projects],
  )
  const activeInstance =
    instances.find((instance) => instance.projectId === panel.activeProjectId) ?? instances[0] ?? null
  const progressSummary = enabledToolProgress(actions, milestones)
  const calendarDrafts = latestCalendarDrafts(toolRuns)
  const [applyStatus, setApplyStatus] = useState<string | null>(null)
  const [isApplyingCalendarDrafts, setIsApplyingCalendarDrafts] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    loadOverview().catch(() => undefined)
  }, [loadOverview])

  useEffect(() => {
    if (!panel.activeProjectId && activeInstance) {
      panel.setActiveProjectId(activeInstance.projectId)
    }
  }, [activeInstance, panel])

  useEffect(() => {
    if (!activeInstance) return
    loadProjectDetails(activeInstance.projectId).catch(() => undefined)
  }, [activeInstance, loadProjectDetails])

  useEffect(() => {
    if (activeWorkspacePanel === 'enabled-tools' && calendarDrafts.length) {
      showWorkspaceCalendar()
    }
  }, [activeWorkspacePanel, calendarDrafts.length, showWorkspaceCalendar])

  async function toggleRouting(instance: EnabledToolInstance) {
    const metadata = createEnabledToolMetadata({
      activationForm: instance.activationForm,
      activationSummary: instance.activationSummary,
      adapterId: instance.adapterId,
      instanceAlias: instance.instanceAlias,
      routeTags: instance.routeTags,
      routingEnabled: !instance.routingEnabled,
      sourceToolId: instance.sourceToolId,
      templateId: instance.templateId,
      toolKind: instance.toolKind,
      toolName: instance.toolName,
    })
    await updateProject(instance.projectId, { metadata })
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
    await loadProjectDetails(activeInstance.projectId)
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
    await loadProjectDetails(activeInstance.projectId)
  }

  async function applyCalendarDrafts() {
    if (!activeInstance || !calendarDrafts.length) return []

    setApplyStatus(null)
    setLocalError(null)
    setIsApplyingCalendarDrafts(true)

    try {
      const { duplicateDrafts, uniqueDrafts } = splitUniqueEventDrafts(calendarDrafts, events)
      const created = []

      for (const draft of uniqueDrafts) {
        created.push(await createEvent(draft))
      }

      await createToolRun({
        input: {
          eventCount: calendarDrafts.length,
          skippedDuplicateCount: duplicateDrafts.length,
          sourceToolId: activeInstance.sourceToolId,
        },
        input_summary: `Apply ${calendarDrafts.length} ${activeInstance.instanceAlias} calendar event(s).`,
        intent: `Apply ${activeInstance.instanceAlias} calendar preview`,
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
        related_goal_id: activeInstance.goalId,
        related_project_id: activeInstance.projectId,
        status: 'success',
        tool_name: activeInstance.toolName,
      })
      await createProgress({
        details: [
          ...uniqueDrafts.map((draft) => `Applied ${draft.title}: ${draft.startAt} - ${draft.endAt}`),
          ...duplicateDrafts.map((duplicate) => `Skipped duplicate ${duplicate.draft.title}: ${duplicate.draft.startAt} - ${duplicate.draft.endAt}`),
        ].join('\n'),
        goal_id: activeInstance.goalId,
        log_type: 'tool_result',
        metadata: activeInstance.project.metadata,
        project_id: activeInstance.projectId,
        summary: `Applied ${created.length} calendar event(s) from ${activeInstance.instanceAlias}.${
          duplicateDrafts.length ? ` Skipped ${duplicateDrafts.length} duplicate(s).` : ''
        }`,
      })
      await loadProjectDetails(activeInstance.projectId)
      setApplyStatus(
        `Applied ${created.length} calendar event${created.length === 1 ? '' : 's'}.${
          duplicateDrafts.length ? ` Skipped ${duplicateDrafts.length} duplicate${duplicateDrafts.length === 1 ? '' : 's'}.` : ''
        }`,
      )

      return created
    } catch (applyError) {
      const message = applyError instanceof Error ? applyError.message : 'Unable to apply calendar drafts'
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
    close: panel.close,
    error: localError ?? error,
    instances,
    isApplyingCalendarDrafts,
    isDetailLoading,
    isLoading,
    milestones,
    progress,
    progressSummary,
    setActionStatus,
    setActiveProjectId: panel.setActiveProjectId,
    setMilestoneStatus,
    toolRuns,
    toggleRouting,
    updateProjectStatus: (projectId: string, status: ProjectStatus) =>
      updateProjectStatus(projectId, status),
  }
}
