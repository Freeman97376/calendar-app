import type { ActiveTool } from './enabledTools'

export const ACTIVE_TOOL_PROMPT_FRAMEWORK_VERSION = 1

function compact(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 500) : fallback
}

function bulletList(values: string[], fallback: string, limit: number): string[] {
  const normalized = values
    .map((value) => compact(value, ''))
    .filter(Boolean)
    .slice(0, limit)

  return normalized.length ? normalized.map((value) => `- ${value}`) : [`- ${fallback}`]
}

/**
 * Stable, human-readable context shared by Active Tool execution and its tests.
 * It keeps user-editable intent separate from the latest chat instruction.
 */
export function buildActiveToolPromptFramework(instance: ActiveTool): string {
  const goal = compact(instance.longTermGoalLabel ?? instance.goal?.title, instance.project.title)
  const purpose = compact(
    instance.activationSummary || instance.project.description,
    'No purpose has been recorded yet.',
  )
  const features = instance.toolFeatures.length ? instance.toolFeatures : instance.routeTags
  const plan = instance.implementationPath.slice(0, 20).map((step) => {
    const title = compact(step.title, `Step ${step.order}`)
    const description = compact(step.description, '')
    return `${step.order}. ${title}${description ? ` — ${description}` : ''}`
  })

  const prompt = [
    `Active Tool Prompt Framework v${ACTIVE_TOOL_PROMPT_FRAMEWORK_VERSION}`,
    '[identity]',
    `Alias: ${compact(instance.instanceAlias, instance.toolName)}`,
    `Tool: ${compact(instance.toolName, 'Active Tool')}`,
    `Parent template: ${compact(instance.parentTemplateLabel, instance.parentTemplateId)}`,
    '',
    '[long_term_goal]',
    goal,
    '',
    '[tool_characteristics]',
    `Purpose: ${purpose}`,
    ...bulletList(features, 'Use the saved purpose and routing signals.', 16),
    '',
    '[routing_signals]',
    ...bulletList(instance.routeTags, 'No explicit routing signals.', 16),
    '',
    '[execution_plan]',
    ...(plan.length
      ? plan
      : ['Use the persisted milestones and action items as the current plan.']),
    '',
    '[operating_rules]',
    '- Treat the latest user message as the immediate request.',
    '- Preserve the long-term goal and tool characteristics unless the user explicitly changes them.',
    '- Update plan memory and return calendar work as preview-only drafts.',
  ].join('\n')

  return prompt.length <= 5000 ? prompt : `${prompt.slice(0, 4980).trimEnd()}\n[truncated]`
}
