import GoalPlannerPanel from './GoalPlannerPanel'
import type { ToolDefinition } from '../types'

export const goalPlannerTool: ToolDefinition = {
  id: 'goal-planner',
  label: 'Goal Planner',
  category: 'planning',
  description: 'SQLite-backed goals, projects, milestones, and actions.',
  activationPrompt:
    'Describe the long-running goal or project workflow this active tool should manage.',
  adapterId: 'generic',
  capabilityTags: ['memory', 'progress'],
  instantiable: true,
  routeTags: ['goal', 'project', 'milestone', 'progress', 'action item'],
  toolName: 'Goal Planner',
  Component: GoalPlannerPanel,
}
