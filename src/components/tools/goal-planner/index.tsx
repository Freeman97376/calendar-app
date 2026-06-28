import GoalPlannerPanel from './GoalPlannerPanel'
import type { ToolDefinition } from '../types'

export const goalPlannerTool: ToolDefinition = {
  id: 'goal-planner',
  label: 'Goal Planner',
  category: 'planning',
  description: 'SQLite-backed goals, projects, milestones, and actions.',
  capabilityTags: ['memory', 'progress'],
  Component: GoalPlannerPanel,
}
