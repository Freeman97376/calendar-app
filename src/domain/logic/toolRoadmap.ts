import { normalizeImplementationPath } from './enabledTools'
import { calculateProjectProgress } from './progress'
import type {
  ActionItemStatus,
  ImplementationPathStep,
  LongTermActionItem,
  LongTermGoal,
  LongTermMilestone,
  LongTermProgressLog,
  LongTermProject,
  LongTermToolRun,
  MilestoneStatus,
} from '../types/longTermMemory'
import type {
  ToolRoadmapSource,
  ToolRoadmapStep,
  ToolRoadmapViewModel,
} from '../types/toolRoadmap'

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function byDueThenCreated<T extends { created_at: string; due_date?: string | null }>(a: T, b: T) {
  const aDue = a.due_date ?? '9999-12-31'
  const bDue = b.due_date ?? '9999-12-31'
  if (aDue !== bDue) return aDue.localeCompare(bDue)
  return a.created_at.localeCompare(b.created_at)
}

function byCreatedDesc<T extends { created_at: string }>(a: T, b: T) {
  return b.created_at.localeCompare(a.created_at)
}

function milestoneStepStatus(
  milestone: LongTermMilestone | undefined,
  actions: LongTermActionItem[],
): ActionItemStatus | MilestoneStatus | 'not_started' {
  if (milestone) return milestone.status
  if (actions.some((action) => action.status === 'blocked')) return 'blocked'
  if (actions.length && actions.every((action) => action.status === 'done' || action.status === 'skipped')) {
    return 'done'
  }
  if (actions.some((action) => action.status === 'scheduled')) return 'scheduled'
  if (actions.length) return 'todo'
  return 'not_started'
}

function enrichStep(
  step: ImplementationPathStep,
  milestones: LongTermMilestone[],
  actions: LongTermActionItem[],
): ToolRoadmapStep {
  const milestone = step.milestoneId
    ? milestones.find((candidate) => candidate.milestone_id === step.milestoneId)
    : undefined
  const stepActions = step.actionIds?.length
    ? actions.filter((action) => step.actionIds?.includes(action.action_id))
    : step.milestoneId
      ? actions.filter((action) => action.milestone_id === step.milestoneId)
      : []
  const countedActions = stepActions.filter((action) => action.status !== 'skipped')

  return {
    ...step,
    actionCount: countedActions.length,
    completedActionCount: countedActions.filter((action) => action.status === 'done').length,
    dueDate: milestone?.due_date ?? stepActions.find((action) => action.due_date)?.due_date ?? null,
    status: milestoneStepStatus(milestone, stepActions),
  }
}

function stepsFromMilestones(
  milestones: LongTermMilestone[],
  actions: LongTermActionItem[],
): ToolRoadmapStep[] {
  return [...milestones].sort(byDueThenCreated).map((milestone, index) =>
    enrichStep(
      {
        actionIds: actions
          .filter((action) => action.milestone_id === milestone.milestone_id)
          .map((action) => action.action_id),
        description: milestone.description || undefined,
        id: milestone.milestone_id,
        milestoneId: milestone.milestone_id,
        order: index + 1,
        title: milestone.title,
      },
      milestones,
      actions,
    ),
  )
}

function stepsFromActions(actions: LongTermActionItem[]): ToolRoadmapStep[] {
  return [...actions].sort(byDueThenCreated).map((action, index) => ({
    actionCount: action.status === 'skipped' ? 0 : 1,
    actionIds: [action.action_id],
    completedActionCount: action.status === 'done' ? 1 : 0,
    description: action.description || undefined,
    dueDate: action.due_date,
    id: action.action_id,
    order: index + 1,
    status: action.status,
    title: action.title,
  }))
}

function summaryStep(project: LongTermProject): ToolRoadmapStep {
  const activationSummary = optionalString(project.metadata.activationSummary)
  const title = activationSummary || project.description || project.title || 'No implementation path yet'

  return {
    actionCount: 0,
    completedActionCount: 0,
    description: activationSummary && project.description ? project.description : undefined,
    dueDate: null,
    id: 'activation-summary',
    order: 1,
    status: 'not_started',
    title,
  }
}

export function buildToolRoadmap(
  goal: LongTermGoal | null,
  project: LongTermProject,
  milestones: LongTermMilestone[],
  actions: LongTermActionItem[],
  progress: LongTermProgressLog[],
  toolRuns: LongTermToolRun[],
): ToolRoadmapViewModel {
  const implementationPath = normalizeImplementationPath(project.metadata.implementationPath)
  const longTermGoalLabel = optionalString(project.metadata.longTermGoalLabel)
  let pathSource: ToolRoadmapSource = 'summary'
  let steps: ToolRoadmapStep[]

  if (implementationPath.length) {
    pathSource = 'metadata'
    steps = implementationPath.map((step) => enrichStep(step, milestones, actions))
  } else if (milestones.length) {
    pathSource = 'milestones'
    steps = stepsFromMilestones(milestones, actions)
  } else if (actions.length) {
    pathSource = 'actions'
    steps = stepsFromActions(actions)
  } else {
    steps = [summaryStep(project)]
  }

  return {
    goalSummary: goal?.description || project.description || optionalString(project.metadata.activationSummary),
    goalTitle: longTermGoalLabel || goal?.title || project.title,
    pathSource,
    progressSummary: calculateProjectProgress(actions, milestones),
    projectSummary: project.description || optionalString(project.metadata.activationSummary),
    projectTitle: project.title,
    recentProgress: [...progress].sort(byCreatedDesc).slice(0, 5),
    recentToolRuns: [...toolRuns].sort(byCreatedDesc).slice(0, 5),
    steps,
  }
}

export function implementationPathToText(steps: ImplementationPathStep[]): string {
  return normalizeImplementationPath(steps)
    .map((step) => `${step.title}${step.description ? ` | ${step.description}` : ''}`)
    .join('\n')
}

export function implementationPathFromText(value: string): ImplementationPathStep[] {
  return value
    .split(/\r?\n/)
    .map((line, index): ImplementationPathStep | null => {
      const [titlePart, ...descriptionParts] = line.split('|')
      const title = titlePart.trim()
      if (!title) return null

      const description = descriptionParts.join('|').trim()

      return {
        description: description || undefined,
        id: `path-${index + 1}`,
        order: index + 1,
        title,
      }
    })
    .filter((step): step is ImplementationPathStep => Boolean(step))
}
