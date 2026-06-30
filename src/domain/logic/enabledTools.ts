import { calculateProjectProgress } from './progress'
import type {
  AIProgressToolKind,
} from '../types'
import type {
  LongTermActionItem,
  LongTermGoal,
  LongTermMilestone,
  LongTermProject,
} from '../types/longTermMemory'

export const ENABLED_TOOL_CATEGORY = 'enabled-tool'

export type EnabledToolMetadata = {
  activationForm: Record<string, string>
  activationSummary: string
  adapterId?: string
  instanceAlias: string
  routeTags: string[]
  routingEnabled: boolean
  sourceToolId: string
  templateId: string
  toolCategory: typeof ENABLED_TOOL_CATEGORY
  toolKind?: AIProgressToolKind
  toolName: string
}

export type EnabledToolInstance = {
  activationForm: Record<string, string>
  activationSummary: string
  adapterId?: string
  goal: LongTermGoal | null
  goalId: string
  instanceAlias: string
  project: LongTermProject
  projectId: string
  routeTags: string[]
  routingEnabled: boolean
  sourceToolId: string
  status: LongTermProject['status']
  templateId: string
  toolKind?: AIProgressToolKind
  toolName: string
}

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

export function isEnabledToolMetadata(
  metadata: Record<string, unknown>,
): metadata is EnabledToolMetadata {
  return (
    metadata.toolCategory === ENABLED_TOOL_CATEGORY &&
    typeof metadata.templateId === 'string' &&
    typeof metadata.sourceToolId === 'string' &&
    typeof metadata.instanceAlias === 'string' &&
    typeof metadata.toolName === 'string'
  )
}

export function createEnabledToolMetadata(input: {
  activationForm?: Record<string, string>
  activationSummary: string
  adapterId?: string
  instanceAlias: string
  routeTags?: string[]
  routingEnabled?: boolean
  sourceToolId: string
  templateId: string
  toolKind?: AIProgressToolKind
  toolName: string
}): EnabledToolMetadata {
  return {
    activationForm: input.activationForm ?? {},
    activationSummary: input.activationSummary,
    adapterId: input.adapterId,
    instanceAlias: input.instanceAlias,
    routeTags: input.routeTags ?? [],
    routingEnabled: input.routingEnabled ?? true,
    sourceToolId: input.sourceToolId,
    templateId: input.templateId,
    toolCategory: ENABLED_TOOL_CATEGORY,
    toolKind: input.toolKind,
    toolName: input.toolName,
  }
}

export function enabledToolInstanceFromProject(
  project: LongTermProject,
  goals: LongTermGoal[],
): EnabledToolInstance | null {
  const metadata = project.metadata
  if (!isEnabledToolMetadata(metadata)) return null

  return {
    activationForm: stringRecord(metadata.activationForm),
    activationSummary: typeof metadata.activationSummary === 'string' ? metadata.activationSummary : '',
    adapterId: typeof metadata.adapterId === 'string' ? metadata.adapterId : undefined,
    goal: goals.find((goal) => goal.goal_id === project.goal_id) ?? null,
    goalId: project.goal_id,
    instanceAlias: metadata.instanceAlias,
    project,
    projectId: project.project_id,
    routeTags: stringArray(metadata.routeTags),
    routingEnabled: metadata.routingEnabled !== false,
    sourceToolId: metadata.sourceToolId,
    status: project.status,
    templateId: metadata.templateId,
    toolKind: knownToolKind(metadata.toolKind),
    toolName: metadata.toolName,
  }
}

export function enabledToolInstancesFromProjects(
  projects: LongTermProject[],
  goals: LongTermGoal[],
): EnabledToolInstance[] {
  return projects
    .map((project) => enabledToolInstanceFromProject(project, goals))
    .filter((instance): instance is EnabledToolInstance => Boolean(instance))
}

export function enabledToolProgress(
  actions: LongTermActionItem[],
  milestones: LongTermMilestone[],
) {
  return calculateProjectProgress(actions, milestones)
}

export function enabledToolRouteSummary(instance: EnabledToolInstance) {
  return {
    activationSummary: instance.activationSummary,
    adapterId: instance.adapterId,
    instanceAlias: instance.instanceAlias,
    projectId: instance.projectId,
    routeTags: instance.routeTags,
    routingEnabled: instance.routingEnabled,
    sourceToolId: instance.sourceToolId,
    status: instance.status,
    templateId: instance.templateId,
    toolName: instance.toolName,
  }
}
