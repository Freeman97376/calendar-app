import { calculateProjectProgress } from './progress'
import type {
  AIProgressToolKind,
} from '../types'
import type {
  ImplementationPathStep,
  LongTermActionItem,
  LongTermGoal,
  LongTermMilestone,
  LongTermProject,
} from '../types/longTermMemory'

export const ACTIVE_TOOL_CATEGORY = 'active-tool'
export const LEGACY_ENABLED_TOOL_CATEGORY = 'enabled-tool'

export type ActiveToolMetadata = {
  activationForm: Record<string, string>
  activationSummary: string
  adapterId?: string
  implementationPath?: ImplementationPathStep[]
  instanceAlias: string
  longTermGoalLabel?: string
  parentTemplateId: string
  parentTemplateLabel: string
  parentTemplateToolName: string
  roadmapFormatVersion?: 1
  routeTags: string[]
  routingEnabled: boolean
  sourceToolId: string
  templateId: string
  toolCategory: typeof ACTIVE_TOOL_CATEGORY | typeof LEGACY_ENABLED_TOOL_CATEGORY
  toolFeatures?: string[]
  toolKind?: AIProgressToolKind
  toolName: string
}

export type ActiveTool = {
  activationForm: Record<string, string>
  activationSummary: string
  adapterId?: string
  goal: LongTermGoal | null
  goalId: string
  implementationPath: ImplementationPathStep[]
  instanceAlias: string
  longTermGoalLabel?: string
  parentTemplateId: string
  parentTemplateLabel: string
  parentTemplateToolName: string
  project: LongTermProject
  projectId: string
  roadmapFormatVersion: 1
  routeTags: string[]
  routingEnabled: boolean
  sourceToolId: string
  status: LongTermProject['status']
  templateId: string
  toolFeatures: string[]
  toolKind?: AIProgressToolKind
  toolName: string
}

export type EnabledToolMetadata = ActiveToolMetadata
export type EnabledToolInstance = ActiveTool

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : []
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function knownToolKind(value: unknown): AIProgressToolKind | undefined {
  return value === 'fitness' || value === 'agent-learning' ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeImplementationPath(value: unknown): ImplementationPathStep[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry, index): ImplementationPathStep | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null

      const record = entry as Record<string, unknown>
      const title = optionalString(record.title)
      if (!title) return null

      const actionIds = Array.isArray(record.actionIds)
        ? record.actionIds.filter((actionId): actionId is string => typeof actionId === 'string' && Boolean(actionId.trim()))
        : undefined

      return {
        actionIds: actionIds?.length ? actionIds : undefined,
        description: optionalString(record.description),
        id: optionalString(record.id) ?? `path-${index + 1}`,
        milestoneId: optionalString(record.milestoneId),
        order: typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : index + 1,
        title,
      }
    })
    .filter((entry): entry is ImplementationPathStep => Boolean(entry))
    .sort((a, b) => a.order - b.order)
}

export function isActiveToolMetadata(
  metadata: Record<string, unknown>,
): metadata is ActiveToolMetadata {
  return (
    (metadata.toolCategory === ACTIVE_TOOL_CATEGORY ||
      metadata.toolCategory === LEGACY_ENABLED_TOOL_CATEGORY) &&
    (typeof metadata.parentTemplateId === 'string' || typeof metadata.templateId === 'string') &&
    (typeof metadata.sourceToolId === 'string' || typeof metadata.parentTemplateId === 'string') &&
    typeof metadata.instanceAlias === 'string' &&
    typeof metadata.toolName === 'string'
  )
}

export function isEnabledToolMetadata(
  metadata: Record<string, unknown>,
): metadata is EnabledToolMetadata {
  return isActiveToolMetadata(metadata)
}

export function createActiveToolMetadata(input: {
  activationForm?: Record<string, string>
  activationSummary: string
  adapterId?: string
  implementationPath?: ImplementationPathStep[]
  instanceAlias: string
  longTermGoalLabel?: string
  parentTemplateId: string
  parentTemplateLabel: string
  parentTemplateToolName?: string
  roadmapFormatVersion?: 1
  routeTags?: string[]
  routingEnabled?: boolean
  sourceToolId?: string
  templateId?: string
  toolFeatures?: string[]
  toolKind?: AIProgressToolKind
  toolName: string
}): ActiveToolMetadata {
  const parentTemplateToolName = input.parentTemplateToolName ?? input.toolName

  return {
    activationForm: input.activationForm ?? {},
    activationSummary: input.activationSummary,
    adapterId: input.adapterId,
    implementationPath: normalizeImplementationPath(input.implementationPath),
    instanceAlias: input.instanceAlias,
    longTermGoalLabel: input.longTermGoalLabel,
    parentTemplateId: input.parentTemplateId,
    parentTemplateLabel: input.parentTemplateLabel,
    parentTemplateToolName,
    roadmapFormatVersion: input.roadmapFormatVersion ?? 1,
    routeTags: input.routeTags ?? [],
    routingEnabled: input.routingEnabled ?? true,
    sourceToolId: input.sourceToolId ?? input.parentTemplateId,
    templateId: input.templateId ?? input.parentTemplateId,
    toolCategory: ACTIVE_TOOL_CATEGORY,
    toolFeatures: input.toolFeatures ?? [],
    toolKind: input.toolKind,
    toolName: input.toolName,
  }
}

export function createEnabledToolMetadata(input: {
  activationForm?: Record<string, string>
  activationSummary: string
  adapterId?: string
  instanceAlias: string
  parentTemplateId?: string
  parentTemplateLabel?: string
  parentTemplateToolName?: string
  routeTags?: string[]
  routingEnabled?: boolean
  sourceToolId: string
  templateId: string
  toolFeatures?: string[]
  toolKind?: AIProgressToolKind
  toolName: string
}): EnabledToolMetadata {
  return createActiveToolMetadata({
    ...input,
    parentTemplateId: input.parentTemplateId ?? input.templateId,
    parentTemplateLabel: input.parentTemplateLabel ?? input.toolName,
    parentTemplateToolName: input.parentTemplateToolName ?? input.toolName,
  })
}

export function activeToolFromProject(
  project: LongTermProject,
  goals: LongTermGoal[],
): ActiveTool | null {
  const metadata = project.metadata
  if (!isActiveToolMetadata(metadata)) return null

  const parentTemplateId =
    typeof metadata.parentTemplateId === 'string' ? metadata.parentTemplateId : metadata.templateId
  const parentTemplateLabel =
    typeof metadata.parentTemplateLabel === 'string' ? metadata.parentTemplateLabel : metadata.toolName
  const parentTemplateToolName =
    typeof metadata.parentTemplateToolName === 'string'
      ? metadata.parentTemplateToolName
      : metadata.toolName

  return {
    activationForm: stringRecord(metadata.activationForm),
    activationSummary: typeof metadata.activationSummary === 'string' ? metadata.activationSummary : '',
    adapterId: typeof metadata.adapterId === 'string' ? metadata.adapterId : undefined,
    goal: goals.find((goal) => goal.goal_id === project.goal_id) ?? null,
    goalId: project.goal_id,
    implementationPath: normalizeImplementationPath(metadata.implementationPath),
    instanceAlias: metadata.instanceAlias,
    longTermGoalLabel: optionalString(metadata.longTermGoalLabel),
    parentTemplateId,
    parentTemplateLabel,
    parentTemplateToolName,
    project,
    projectId: project.project_id,
    roadmapFormatVersion: 1,
    routeTags: stringArray(metadata.routeTags),
    routingEnabled: metadata.routingEnabled !== false,
    sourceToolId: typeof metadata.sourceToolId === 'string' ? metadata.sourceToolId : parentTemplateId,
    status: project.status,
    templateId: typeof metadata.templateId === 'string' ? metadata.templateId : parentTemplateId,
    toolFeatures: stringArray(metadata.toolFeatures),
    toolKind: knownToolKind(metadata.toolKind),
    toolName: metadata.toolName,
  }
}

export function enabledToolInstanceFromProject(
  project: LongTermProject,
  goals: LongTermGoal[],
): EnabledToolInstance | null {
  return activeToolFromProject(project, goals)
}

export function activeToolsFromProjects(
  projects: LongTermProject[],
  goals: LongTermGoal[],
): ActiveTool[] {
  return projects
    .map((project) => activeToolFromProject(project, goals))
    .filter((instance): instance is ActiveTool => Boolean(instance))
}

export function enabledToolInstancesFromProjects(
  projects: LongTermProject[],
  goals: LongTermGoal[],
): EnabledToolInstance[] {
  return activeToolsFromProjects(projects, goals)
}

export function enabledToolProgress(
  actions: LongTermActionItem[],
  milestones: LongTermMilestone[],
) {
  return calculateProjectProgress(actions, milestones)
}

export function activeToolRouteSummary(instance: ActiveTool) {
  return {
    activationSummary: instance.activationSummary,
    adapterId: instance.adapterId,
    instanceAlias: instance.instanceAlias,
    parentTemplateId: instance.parentTemplateId,
    parentTemplateLabel: instance.parentTemplateLabel,
    projectId: instance.projectId,
    routeTags: instance.routeTags,
    routingEnabled: instance.routingEnabled,
    sourceToolId: instance.sourceToolId,
    status: instance.status,
    templateId: instance.templateId,
    implementationPlan: instance.implementationPath.map((step) =>
      step.description ? `${step.title}: ${step.description}` : step.title,
    ),
    longTermGoalLabel: instance.longTermGoalLabel,
    toolFeatures: instance.toolFeatures,
    toolName: instance.toolName,
  }
}

export function enabledToolRouteSummary(instance: EnabledToolInstance) {
  return activeToolRouteSummary(instance)
}
